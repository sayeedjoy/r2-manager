import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigForTests } from "../src/config";
import { createApp } from "../src/app";
import { DEMO_LOGIN } from "../src/demo/routes";
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
  const signedIn = { cookie: "r2m_demo=demo" };
  const anonymousGet = (path: string) => app().request(`http://localhost:8787${path}`);
  const get = (path: string, headers?: Record<string, string>) =>
    app().request(`http://localhost:8787${path}`, { headers: { ...signedIn, ...headers } });
  const post = (path: string, body: unknown, headers: Record<string, string> = signedIn) =>
    app().request(`http://localhost:8787${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:8787", ...headers },
      body: JSON.stringify(body),
    });

  it("publishes the demo account and keeps registration closed", async () => {
    const status = await (await anonymousGet("/api/v1/auth/status")).json();
    expect(status).toMatchObject({
      demo: true,
      setupRequired: false,
      passwordResetAvailable: false,
      demoLogin: DEMO_LOGIN,
    });
  });

  it("asks for the demo sign-in before showing anything", async () => {
    for (const path of ["/api/v1/me", "/api/v1/buckets", "/api/v1/objects?bucket=demo-bucket&prefix="]) {
      expect((await anonymousGet(path)).status, path).toBe(401);
    }
  });

  it("signs in with the demo account only, then signs out", async () => {
    for (const body of [
      { ...DEMO_LOGIN, password: "wrong" },
      { ...DEMO_LOGIN, email: "someone@example.com" },
    ]) {
      const refused = await post("/api/v1/auth/login", body, {});
      expect(refused.status).toBe(401);
      expect(refused.headers.get("set-cookie")).toBeNull();
    }

    const login = await post("/api/v1/auth/login", DEMO_LOGIN, {});
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ mfaRequired: false });
    const setCookie = login.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);

    const cookie = setCookie.split(";")[0]!;
    const me = await (await get("/api/v1/me", { cookie })).json();
    expect(me).toMatchObject({ displayName: "Demo visitor", demo: true });

    const logout = await post("/api/v1/auth/logout", {}, { cookie });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toMatch(/^r2m_demo=;/);
  });

  it("uses a __Host- cookie over https", async () => {
    resetConfigForTests();
    const config = loadConfig({ ...demoEnv, NODE_ENV: "production", APP_BASE_URL: "https://demo.example.com" });
    const login = await createApp({ config }).request("https://demo.example.com/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(DEMO_LOGIN),
    });
    expect(login.headers.get("set-cookie")).toMatch(/^__Host-r2m_demo=demo;.*Secure/i);
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
      ["/api/v1/auth/setup", { displayName: "x", email: "a@example.com", password: "a-long-password" }],
      ["/api/v1/auth/password/forgot", { email: "demo@example.com" }],
      ["/api/v1/auth/password/reset", { token: "x", password: "a-long-password" }],
    ] as const) {
      const res = await post(path, body);
      expect(res.status, path).toBe(403);
      expect((await res.json()).error.message, path).toMatch(/read-only demo/);
    }
  });

  it("shows a sample admin area without a database", async () => {
    const me = await (await get("/api/v1/me")).json();
    expect(me.role).toBe("admin");

    const { users } = await (await get("/api/v1/admin/users")).json();
    expect(users.map((u: { id: string }) => u.id)).toContain(me.id);

    expect(await (await get("/api/v1/admin/settings")).json()).toHaveProperty("maxUploadSizeBytes");
    expect(await (await get("/api/v1/admin/smtp")).json()).toMatchObject({ enabled: true, passwordSet: true });
    expect(await (await get("/api/v1/admin/health")).json()).toMatchObject({
      checks: { storage: "ok" },
      buckets: ["demo-bucket"],
    });

    const { sessions } = await (await get("/api/v1/account/sessions", { "user-agent": "vitest" })).json();
    expect(sessions).toMatchObject([{ current: true, userAgent: "vitest" }]);

    expect((await anonymousGet("/api/v1/admin/audit")).status).toBe(401);
  });

  it("pages and filters the sample audit log", async () => {
    const first = await (await get("/api/v1/admin/audit?limit=25")).json();
    expect(first.events).toHaveLength(25);
    expect(first.total).toBeGreaterThan(25);
    const times = first.events.map((e: { createdAt: string }) => Date.parse(e.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const second = await (await get("/api/v1/admin/audit?limit=25&offset=25")).json();
    expect(second.events[0].id).not.toBe(first.events[0].id);

    const failures = await (await get("/api/v1/admin/audit?outcome=failure&limit=100")).json();
    expect(failures.total).toBeGreaterThan(0);
    expect(failures.events.every((e: { outcome: string }) => e.outcome === "failure")).toBe(true);

    const shares = await (await get("/api/v1/admin/audit?q=SHARE.&limit=100")).json();
    expect(shares.total).toBeGreaterThan(0);
    expect(shares.events.every((e: { action: string }) => e.action.startsWith("share."))).toBe(true);
  });

  it("refuses admin and account changes", async () => {
    for (const [method, path] of [
      ["PUT", "/api/v1/admin/settings"],
      ["PUT", "/api/v1/admin/smtp"],
      ["POST", "/api/v1/admin/users"],
      ["POST", "/api/v1/account/password"],
      ["DELETE", "/api/v1/account/sessions/demo"],
    ] as const) {
      const res = await app().request(`http://localhost:8787${path}`, {
        method,
        headers: { "content-type": "application/json", ...signedIn },
        body: "{}",
      });
      expect(res.status, path).toBe(403);
      expect((await res.json()).error.message, path).toMatch(/read-only demo/);
    }
  });

  it("doesn't mount the share gateway or the cron trigger", async () => {
    for (const path of ["/s/some-token", "/api/v1/internal/cron"]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
