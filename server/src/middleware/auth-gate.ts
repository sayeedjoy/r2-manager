import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { AppError } from "@r2-manager/shared";
import type { HonoEnv } from "../types";
import { users } from "../db/schema";
import { readSession, touchSession } from "../services/sessions";

type UserRow = typeof users.$inferSelect;

/**
 * AUTH-03: combines Cloudflare Access and password sessions per AUTH_MODE.
 * - "access": the Access email must belong to an active user.
 * - "password": a valid session cookie (with 2FA completed, if the user has it on).
 * - "both": both, and the Access email must be the session user's email, so one person's
 *   Access login can't carry someone else's app session.
 * Resolves the identity to an active users row and sets c.set("user").
 */
export const authGate = (): MiddlewareHandler<HonoEnv> => async (c, next) => {
  const { env } = c.get("config");
  const db = c.get("db");
  const mode = env.AUTH_MODE;
  const accessEmail = c.get("accessIdentity")?.email;

  let record: UserRow | undefined;

  if (mode === "access") {
    if (!accessEmail) throw new AppError("UNAUTHENTICATED", "Cloudflare Access sign-in required");
    record = await db.query.users.findFirst({ where: eq(users.identity, accessEmail) });
  } else {
    if (mode === "both" && !accessEmail) throw new AppError("UNAUTHENTICATED", "Cloudflare Access sign-in required");
    const found = await readSession(c);
    if (!found || found.session.mfaPending) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
    if (mode === "both" && found.user.identity !== accessEmail) {
      throw new AppError("UNAUTHORIZED", "Your Cloudflare Access login and app account are for different emails");
    }
    await touchSession(db, found.session);
    c.set("sessionId", found.session.id);
    record = found.user;
  }

  if (!record || record.status !== "active") {
    throw new AppError("UNAUTHORIZED", "No active account for this identity");
  }

  c.set("user", {
    id: record.id,
    identity: record.identity,
    displayName: record.displayName,
    role: record.role,
  });

  await next();
};
