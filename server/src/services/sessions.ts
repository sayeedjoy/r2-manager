import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppConfig } from "../config";
import type { Database } from "../db/client";
import { sessions, users } from "../db/schema";
import type { HonoEnv } from "../types";
import { clientIpFromForwardedFor } from "./client-ip";
import { generateToken, hashToken } from "./crypto";

/** A signed-in session lasts at most this long, however active it is. */
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
/** ...and ends early after this long without a request. */
const SESSION_IDLE_SECONDS = 24 * 60 * 60;
/** Time allowed between a correct password and the 2FA code. */
const MFA_PENDING_SECONDS = 10 * 60;
/** lastSeenAt is only rewritten this often, so ordinary browsing doesn't write to Postgres on every request. */
const TOUCH_INTERVAL_SECONDS = 5 * 60;

type SessionRow = typeof sessions.$inferSelect;
type UserRow = typeof users.$inferSelect;

function isSecure(config: AppConfig): boolean {
  return new URL(config.env.APP_BASE_URL).protocol === "https:";
}

/** `__Host-` pins the cookie to this exact host, over HTTPS, path "/". Browsers only accept it on secure origins. */
export function sessionCookieName(config: AppConfig): string {
  return isSecure(config) ? "__Host-r2m_session" : "r2m_session";
}

export function requestIp(c: Context<HonoEnv>): string {
  return clientIpFromForwardedFor(c.req.header("x-forwarded-for"), c.get("config").env.TRUST_PROXY_HOPS);
}

/**
 * Starts a session and sets its cookie. Always a fresh token, never an upgrade of an existing one, so a
 * token planted before login (session fixation) is worthless afterwards.
 */
export async function startSession(
  c: Context<HonoEnv>,
  userId: string,
  opts: { mfaPending: boolean },
): Promise<string> {
  const { db, config } = c.var;
  const token = generateToken(32);
  const lifetime = opts.mfaPending ? MFA_PENDING_SECONDS : SESSION_MAX_AGE_SECONDS;
  const [row] = await db
    .insert(sessions)
    .values({
      tokenHash: hashToken(token),
      userId,
      mfaPending: opts.mfaPending,
      ip: requestIp(c),
      userAgent: c.req.header("user-agent")?.slice(0, 512) ?? null,
      expiresAt: new Date(Date.now() + lifetime * 1000),
    })
    .returning({ id: sessions.id });

  setCookie(c, sessionCookieName(config), token, {
    httpOnly: true,
    secure: isSecure(config),
    // Strict: the cookie never rides along on a request another site starts, which is most of CSRF's attack surface.
    sameSite: "Strict",
    path: "/",
    maxAge: lifetime,
  });
  return row!.id;
}

export function clearSessionCookie(c: Context<HonoEnv>): void {
  const { config } = c.var;
  deleteCookie(c, sessionCookieName(config), { path: "/", secure: isSecure(config) });
}

/** The session row and user behind this request's cookie, if the session is still valid. Expired rows are removed. */
export async function readSession(
  c: Context<HonoEnv>,
): Promise<{ session: SessionRow; user: UserRow } | null> {
  const { db, config } = c.var;
  const token = getCookie(c, sessionCookieName(config));
  if (!token || token.length > 128) return null;

  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  const idleLimit = row.session.mfaPending ? MFA_PENDING_SECONDS : SESSION_IDLE_SECONDS;
  if (row.session.expiresAt.getTime() <= now || row.session.lastSeenAt.getTime() + idleLimit * 1000 <= now) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  return row;
}

/** Records activity so the idle timeout slides forward. */
export async function touchSession(db: Database, session: SessionRow): Promise<void> {
  if (Date.now() - session.lastSeenAt.getTime() < TOUCH_INTERVAL_SECONDS * 1000) return;
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
}

export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Signs a user out everywhere (password change/reset, disable, 2FA reset), optionally keeping the current session. */
export async function revokeUserSessions(db: Database, userId: string, exceptSessionId?: string): Promise<void> {
  await db
    .delete(sessions)
    .where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId));
}

/** Cron: removes sessions past their absolute or idle expiry. */
export async function deleteExpiredSessions(db: Database): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, new Date()),
        lt(sessions.lastSeenAt, sql`now() - make_interval(secs => ${SESSION_IDLE_SECONDS})`),
      ),
    )
    .returning({ id: sessions.id });
  return deleted.length;
}
