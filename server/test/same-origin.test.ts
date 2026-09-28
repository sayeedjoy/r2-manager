import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { AppError } from "@r2-manager/shared";
import type { AppConfig } from "../src/config";
import type { HonoEnv } from "../src/types";
import { sameOriginMutations } from "../src/middleware/same-origin";

function makeApp() {
  const app = new Hono<HonoEnv>();
  app.use("*", async (c, next) => {
    c.set("config", { env: { APP_BASE_URL: "http://localhost:8787" } } as AppConfig);
    await next();
  });
  app.use("*", sameOriginMutations());
  app.all("/x", (c) => c.text("ok"));
  app.onError((err, c) => c.text(err.message, err instanceof AppError ? (err.status as 403) : 500));
  return app;
}

describe("sameOriginMutations (CSRF)", () => {
  const app = makeApp();
  const post = (headers: Record<string, string>) => app.request("http://localhost:8787/x", { method: "POST", headers });

  it("allows the app's own origin", async () => {
    expect((await post({ origin: "http://localhost:8787", "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  it("allows a same-origin page behind a proxy that rewrites Host (the Vite dev proxy)", async () => {
    // Page on :5173, Vite forwards with changeOrigin, so Host and APP_BASE_URL both say :8787.
    const headers = { origin: "http://localhost:5173", host: "localhost:8787", "sec-fetch-site": "same-origin" };
    expect((await post(headers)).status).toBe(200);
  });

  it("falls back to Origin vs APP_BASE_URL/Host for browsers without Sec-Fetch-Site", async () => {
    expect((await post({ origin: "http://localhost:8787" })).status).toBe(200);
    expect((await post({ origin: "http://localhost:5173", host: "localhost:5173" })).status).toBe(200);
    expect((await post({ origin: "https://evil.example", host: "localhost:8787" })).status).toBe(403);
    expect((await post({ origin: "null" })).status).toBe(403);
  });

  it("allows server-to-server calls that send no browser headers", async () => {
    expect((await post({})).status).toBe(200);
  });

  it("refuses requests another site starts, whatever Origin claims", async () => {
    expect((await post({ "sec-fetch-site": "cross-site", origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "same-site", origin: "https://other.localhost:8787" })).status).toBe(403);
  });

  it("leaves safe methods alone", async () => {
    const res = await app.request("http://localhost:8787/x", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(200);
  });
});
