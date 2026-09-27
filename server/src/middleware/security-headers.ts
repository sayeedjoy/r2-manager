import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types";

/** NFR-01: baseline secure headers for management API responses. */
export const securityHeaders = (): MiddlewareHandler<HonoEnv> => async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
};
