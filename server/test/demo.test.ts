import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigForTests } from "../src/config";
import { createApp } from "../src/app";
import { DemoStorage } from "../src/demo/storage";

afterEach(() => resetConfigForTests());

const demoEnv = { DEMO_MODE: "true", APP_BASE_URL: "http://localhost:8787" };

describe("DEMO_MODE config", () => {
  it("boots with nothing but DEMO_MODE and APP_BASE_URL", () => {
    const config = loadConfig(demoEnv);
    expect(config.demo).toBe(true);
    expect(config.buckets).toEqual(["demo-bucket"]);
  });

  it("never loads a real deployment's database, bucket or auth settings", () => {
    const config = loadConfig({
      ...demoEnv,
      NODE_ENV: "production",
      APP_BASE_URL: "https://demo.example.com",
      DATABASE_URL: "postgres://real:secret@db.internal/prod",
      R2_ACCOUNT_ID: "real-account",
      R2_ACCESS_KEY_ID: "real-key",
      R2_SECRET_ACCESS_KEY: "real-secret",
      R2_BUCKETS: "customer-files,backups",
      R2_ENDPOINT: "http://localhost:8333",
      AUTH_MODE: "access",
      SESSION_SECRET: "",
    });
    expect(config.buckets).toEqual(["demo-bucket"]);
    expect(config.env.DATABASE_URL).not.toContain("real");
    expect(config.env.R2_SECRET_ACCESS_KEY).not.toBe("real-secret");
    expect(config.r2Endpoint).not.toContain("localhost");
  });

  it("is off unless asked for", () => {
    expect(() => loadConfig({ APP_BASE_URL: "http://localhost:8787" })).toThrow(/DATABASE_URL/);
    resetConfigForTests();
    expect(() => loadConfig({ ...demoEnv, DEMO_MODE: "false" })).toThrow(/DATABASE_URL/);
  });
});

describe("DemoStorage", () => {
  const storage = new DemoStorage();

  it("lists the top level as folders plus loose files", async () => {
    const result = await storage.list("b", "", { limit: 100, delimiter: "/" });
    expect(result.commonPrefixes).toEqual(["archive/", "code/", "data/", "documents/", "images/", "logs/"]);
    expect(result.objects.map((o) => o.key)).toEqual(["README.md"]);
    expect(result.truncated).toBe(false);
  });

  it("pages through a folder with a cursor", async () => {
    const first = await storage.list("b", "logs/", { limit: 20, delimiter: "/" });
    expect(first.objects).toHaveLength(20);
    expect(first.truncated).toBe(true);
    const second = await storage.list("b", "logs/", { limit: 20, delimiter: "/", cursor: first.cursor! });
    expect(second.objects).toHaveLength(10);
    expect(second.cursor).toBeNull();
    expect(new Set([...first.objects, ...second.objects].map((o) => o.key)).size).toBe(30);
  });

  it("serves byte ranges", async () => {
    const result = await storage.get("b", "README.md", { range: { start: 0, end: 8 } });
    expect(result?.range).toEqual({ start: 0, end: 8, total: result!.size });
    expect(await new Response(result!.body).text()).toBe("# Welcome");
  });

  it("refuses every write", async () => {
    await expect(storage.put("b", "x.txt", new Uint8Array())).rejects.toThrow(/read-only demo/);
    await expect(storage.deleteMany("b", ["README.md"])).rejects.toThrow(/read-only demo/);
    await expect(storage.createMultipartUpload("b", "x.bin")).rejects.toThrow(/read-only demo/);
    expect(await storage.head("b", "README.md")).not.toBeNull();
  });
});

describe("DEMO_MODE app", () => {
  const app = () => createApp({ config: loadConfig(demoEnv) });
  const get = (path: string, headers?: Record<string, string>) => app().request(`http://localhost:8787${path}`, { headers });
  const post = (path: string, body: unknown) =>
    app().request(`http://localhost:8787${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:8787" },
      body: JSON.stringify(body),
    });

  it("signs nobody in: status says demo and /me is the demo visitor", async () => {
    const status = await (await get("/api/v1/auth/status")).json();
    expect(status).toMatchObject({ demo: true, setupRequired: false });
    const me = await (await get("/api/v1/me")).json();
    expect(me).toMatchObject({ displayName: "Demo visitor", demo: true });
  });

  it("browses and downloads the sample files without a database", async () => {
    expect(await (await get("/api/v1/buckets")).json()).toEqual({ buckets: ["demo-bucket"] });

    const listing = await (await get("/api/v1/objects?bucket=demo-bucket&prefix=data/")).json();
    expect(listing.entries.map((e: { key: string }) => e.key)).toContain("data/sales-2026.csv");

    const content = await get("/api/v1/objects/content?bucket=demo-bucket&key=README.md", { range: "bytes=0-8" });
    expect(content.status).toBe(206);
    expect(await content.text()).toBe("# Welcome");

    const metadata = await (await get("/api/v1/metadata?bucket=demo-bucket&key=data/app-config.json")).json();
    expect(metadata.customMetadata).toEqual({ owner: "platform-team", environment: "demo" });

    expect(await (await get("/api/v1/shares?bucket=demo-bucket&key=README.md")).json()).toEqual({ shares: [] });
  });

  it("rejects unsatisfiable byte ranges", async () => {
    const metadata = await (await get("/api/v1/metadata?bucket=demo-bucket&key=README.md")).json();

    for (const range of [`bytes=${metadata.size}-`, "bytes=8-0"]) {
      const response = await get("/api/v1/objects/content?bucket=demo-bucket&key=README.md", { range });
      expect(response.status, range).toBe(416);
      expect(response.headers.get("content-range"), range).toBe(`bytes */${metadata.size}`);
      expect(await response.text(), range).toBe("");
    }
  });

  it("refuses every change with the read-only message", async () => {
    for (const [path, body] of [
      ["/api/v1/objects/rename", { bucket: "demo-bucket", key: "README.md", newName: "x.md" }],
      ["/api/v1/objects/delete", { bucket: "demo-bucket", keys: ["README.md"] }],
      ["/api/v1/uploads", { bucket: "demo-bucket", key: "x.bin", size: 1 }],
      ["/api/v1/auth/login", { email: "a@example.com", password: "whatever" }],
      ["/api/v1/auth/setup", { displayName: "x" }],
    ] as const) {
      const res = await post(path, body);
      expect(res.status, path).toBe(403);
      expect((await res.json()).error.message, path).toMatch(/read-only demo/);
    }
  });

  it("doesn't mount the database-backed routes", async () => {
    for (const path of ["/api/v1/admin/users", "/api/v1/account/sessions", "/s/some-token", "/api/v1/internal/cron"]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
