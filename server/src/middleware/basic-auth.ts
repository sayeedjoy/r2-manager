import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types";
import { verifyPassword, timingSafeStringEqual } from "../services/crypto";
import { checkRateLimit, isRateLimited } from "./rate-limit";

const FAILED_ATTEMPTS_LIMIT = { max: 10, windowSeconds: 60 };

/**
 * AUTH-02: HTTP Basic Authentication as a configurable alternative for small
 * deployments. Only failed attempts count toward the rate limit: browsers
 * resend Basic credentials on every request, so counting successes would
 * lock out ordinary use. A locked-out address is refused before its
 * password is checked.
 * Sets c.set("basicAuthOk", true) on success; does not itself deny requests
 * so auth-gate.ts can combine this with Access mode (AUTH-03).
 */
export const basicAuth = (): MiddlewareHandler<HonoEnv & { Variables: { basicAuthOk?: boolean } }> => async (c, next) => {
  const { env } = c.get("config");
  const header = c.req.header("authorization");

  if (header?.startsWith("Basic ")) {
    const db = c.get("db");
    const rateKey = `basic-auth:${c.req.header("x-forwarded-for") ?? "unknown"}`;
    if (await isRateLimited(db, rateKey, FAILED_ATTEMPTS_LIMIT)) {
      c.set("basicAuthOk", false);
      await next();
      return;
    }

    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      const username = idx === -1 ? decoded : decoded.slice(0, idx);
      const password = idx === -1 ? "" : decoded.slice(idx + 1);

      const usernameOk = timingSafeStringEqual(username, env.BASIC_AUTH_USERNAME ?? "");
      const passwordOk = env.BASIC_AUTH_PASSWORD_HASH
        ? await verifyPassword(password, env.BASIC_AUTH_PASSWORD_HASH)
        : false;

      c.set("basicAuthOk", usernameOk && passwordOk);
    } catch {
      c.set("basicAuthOk", false);
    }

    if (!c.get("basicAuthOk")) {
      await checkRateLimit(db, rateKey, FAILED_ATTEMPTS_LIMIT);
    }
  } else {
    c.set("basicAuthOk", false);
  }

  await next();
};
