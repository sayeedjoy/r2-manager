import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types";

const APP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' blob: data:",
  "frame-src blob:",
  "connect-src 'self' https:",
].join("; ");

/** NFR-01: baseline secure headers for API and application responses. */
export const securityHeaders =
  (production = false): MiddlewareHandler<HonoEnv> =>
  async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    if (!c.res.headers.has("Content-Security-Policy"))
      c.header("Content-Security-Policy", APP_CSP);
    if (production) c.header("Strict-Transport-Security", "max-age=31536000");
  };
