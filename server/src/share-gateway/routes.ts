import { Hono } from "hono";
import { baseName } from "@r2-manager/shared";
import type { HonoEnv } from "../types";
import { checkShareAccess, reserveDownload } from "../services/shares";
import { checkRateLimit } from "../middleware/rate-limit";
import { renderPasswordPage, renderErrorPage } from "./password-page";

const app = new Hono<HonoEnv>();

// SHARE-06: no indexing, no caching, isolated from the management SPA.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "no-store");
  c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:;");
  c.header("X-Frame-Options", "DENY");
});

async function rangeFromHeader(header: string | undefined): Promise<{ start: number; end?: number } | undefined> {
  if (!header) return undefined;
  const match = /bytes=(\d+)-(\d*)/.exec(header);
  if (!match) return undefined;
  return { start: Number(match[1]), end: match[2] ? Number(match[2]) : undefined };
}

async function handleShareRequest(c: any, token: string, password: string | undefined) {
  const db = c.get("db");
  const storage = c.get("storage");
  const config = c.get("config");

  const ip = c.req.header("x-forwarded-for") ?? "unknown";
  const rl = await checkRateLimit(db, `share:${ip}`, { max: 30, windowSeconds: 60 });
  if (!rl.allowed) return c.html(renderErrorPage("Too many attempts. Please try again later."), 429);

  const check = await checkShareAccess(db, token, password);
  if (!check.ok) {
    if (check.reason === "password_required") return c.html(renderPasswordPage(token, false));
    if (check.reason === "invalid_password") {
      const pwRl = await checkRateLimit(db, `share-pw:${ip}`, { max: 10, windowSeconds: 300 });
      if (!pwRl.allowed) return c.html(renderErrorPage("Too many incorrect attempts. Please try again later."), 429);
      return c.html(renderPasswordPage(token, true));
    }
    return c.html(renderErrorPage("This link is no longer available."), 404);
  }

  const share = check.share!;

  if (share.deliveryMode === "redirect") {
    const reserved = await reserveDownload(db, share.id);
    if (!reserved) return c.html(renderErrorPage("This link has reached its download limit."), 410);
    const disposition = share.inlinePreview ? undefined : `attachment; filename="${baseName(share.key)}"`;
    const url = await storage.signGetUrl(share.bucket, share.key, 60, { responseContentDisposition: disposition });
    return c.redirect(url, 302);
  }

  // Stream delivery: reserve once per transfer, not per Range request (SHARE-04).
  const range = await rangeFromHeader(c.req.header("range"));
  if (!range) {
    const reserved = await reserveDownload(db, share.id);
    if (!reserved) return c.html(renderErrorPage("This link has reached its download limit."), 410);
  }

  const result = await storage.get(share.bucket, share.key, { range });
  if (!result) return c.html(renderErrorPage("This file is no longer available."), 404);

  const headers = new Headers();
  headers.set("content-type", result.contentType ?? "application/octet-stream");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "no-store");
  headers.set(
    "content-disposition",
    share.inlinePreview ? `inline; filename="${baseName(share.key)}"` : `attachment; filename="${baseName(share.key)}"`,
  );
  if (result.range) {
    headers.set("content-range", `bytes ${result.range.start}-${result.range.end}/${result.range.total}`);
    headers.set("content-length", String(result.range.end - result.range.start + 1));
    return new Response(result.body, { status: 206, headers });
  }
  headers.set("content-length", String(result.size));
  return new Response(result.body, { status: 200, headers });
}

app.get("/:token", async (c) => {
  return handleShareRequest(c, c.req.param("token"), c.req.query("password"));
});

app.post("/:token", async (c) => {
  const form = await c.req.parseBody();
  const password = typeof form.password === "string" ? form.password : undefined;
  return handleShareRequest(c, c.req.param("token"), password);
});

export default app;
