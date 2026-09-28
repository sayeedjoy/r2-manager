import type { MiddlewareHandler } from "hono";
import { AppError } from "@r2-manager/shared";
import type { HonoEnv } from "../types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defense in depth for cookie-authenticated mutations. The session cookie is already SameSite=Strict;
 * this also refuses state-changing requests that the browser says came from another site.
 *
 * Sec-Fetch-Site is preferred: the browser derives it from the page's own origin and scripts can't set it, so it
 * stays correct behind proxies that rewrite Host (the Vite dev proxy does, as can a reverse proxy). Browsers that
 * don't send it fall back to comparing Origin with APP_BASE_URL and the Host header. Server-to-server callers
 * (cron, the mail webhook) send neither header and pass through to their own secret checks.
 */
export const sameOriginMutations = (): MiddlewareHandler<HonoEnv> => async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const fetchSite = c.req.header("sec-fetch-site");
    if (fetchSite) {
      // "none" is a user-initiated navigation (typed URL, bookmark), which no other site can trigger.
      if (fetchSite !== "same-origin" && fetchSite !== "none") {
        throw new AppError("UNAUTHORIZED", "Cross-origin request refused");
      }
    } else {
      const origin = c.req.header("origin");
      if (origin && !isOwnOrigin(origin, c.get("config").env.APP_BASE_URL, c.req.header("host"))) {
        throw new AppError("UNAUTHORIZED", "Cross-origin request refused");
      }
    }
  }
  await next();
};

function isOwnOrigin(origin: string, appBaseUrl: string, host: string | undefined): boolean {
  if (origin === new URL(appBaseUrl).origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // includes the opaque "null" origin sent by sandboxed frames and file:// pages
  }
}
