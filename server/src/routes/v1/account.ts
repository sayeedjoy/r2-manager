import { Hono, type Context } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import {
  AppError,
  changePasswordRequestSchema,
  regenerateRecoveryCodesRequestSchema,
  totpDisableRequestSchema,
  totpEnableRequestSchema,
  type RecoveryCodesResponse,
  type SessionInfo,
  type TotpSetupResponse,
} from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { sessions, users } from "../../db/schema";
import { checkRateLimit, isRateLimited, type RateLimitOptions } from "../../middleware/rate-limit";
import { recordAudit } from "../../services/audit";
import { assertPasswordLogin, checkPassword, isTwoFactorEnabled, setPassword, verifyUserTotp } from "../../services/auth";
import { decryptSecret, encryptSecret } from "../../services/crypto";
import { passwordChangedEmail } from "../../services/email-templates";
import { sendMail } from "../../services/mailer";
import { revokeUserSessions } from "../../services/sessions";
import { generateRecoveryCodes, generateTotpSecret, otpauthUrl, recoveryCodeHash, verifyTotp } from "../../services/totp";

const app = new Hono<HonoEnv>();

/** Re-entering the password (or a 2FA code) to confirm a sensitive change counts against this, failures only. */
const REAUTH_LIMIT: RateLimitOptions = { max: 10, windowSeconds: 15 * 60 };

app.use("*", async (c, next) => {
  assertPasswordLogin(c.get("config"));
  await next();
  c.header("Cache-Control", "no-store");
});

async function loadSelf(c: Context<HonoEnv>) {
  const user = await c.var.db.query.users.findFirst({ where: eq(users.id, c.get("user").id) });
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  return user;
}

/** Throws unless `password` is the signed-in user's current password. */
async function confirmPassword(c: Context<HonoEnv>, password: string) {
  const { db } = c.var;
  const self = c.get("user");
  const key = `reauth:${self.id}`;
  if (await isRateLimited(db, key, REAUTH_LIMIT)) throw new AppError("RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  const user = await checkPassword(db, self.identity, password);
  if (!user) {
    await checkRateLimit(db, key, REAUTH_LIMIT);
    throw new AppError("VALIDATION_ERROR", "Your current password is incorrect");
  }
  return user;
}

function audit(c: Context<HonoEnv>, action: string) {
  return recordAudit(c.var.db, {
    actorId: c.get("user").id,
    action,
    target: c.get("user").identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
}

/** Changes the password and signs out every other session. */
app.post("/password", async (c) => {
  const { db, config } = c.var;
  const body = changePasswordRequestSchema.parse(await c.req.json());
  const user = await confirmPassword(c, body.currentPassword);
  await setPassword(db, user.id, body.newPassword);
  await revokeUserSessions(db, user.id, c.get("sessionId"));
  await audit(c, "account.password.change");
  await sendMail(db, config, passwordChangedEmail(user.identity, user.displayName)).catch(() => {});
  return c.json({ ok: true });
});

/** Starts 2FA enrollment: a new secret for the authenticator app. Nothing changes until /2fa/enable confirms a code. */
app.post("/2fa/setup", async (c) => {
  const { db, config } = c.var;
  const user = await loadSelf(c);
  if (isTwoFactorEnabled(user)) throw new AppError("CONFLICT", "Two-factor authentication is already on");
  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ totpPendingSecret: encryptSecret(secret, config.env.SESSION_SECRET) })
    .where(eq(users.id, user.id));
  return c.json({ secret, otpauthUrl: otpauthUrl("R2 Manager", user.identity, secret) } satisfies TotpSetupResponse);
});

/** Finishes enrollment once the app produces a valid code, and returns the recovery codes (shown only this once). */
app.post("/2fa/enable", async (c) => {
  const { db, config } = c.var;
  const { code } = totpEnableRequestSchema.parse(await c.req.json());
  const user = await loadSelf(c);
  if (isTwoFactorEnabled(user)) throw new AppError("CONFLICT", "Two-factor authentication is already on");
  if (!user.totpPendingSecret) throw new AppError("PRECONDITION_FAILED", "Start two-factor setup first");

  const key = `reauth:${user.id}`;
  if (await isRateLimited(db, key, REAUTH_LIMIT)) throw new AppError("RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  const step = verifyTotp(decryptSecret(user.totpPendingSecret, config.env.SESSION_SECRET), code, null);
  if (step === null) {
    await checkRateLimit(db, key, REAUTH_LIMIT);
    throw new AppError("VALIDATION_ERROR", "That code didn't match. Check the time on your phone and try the newest code.");
  }

  const recoveryCodes = generateRecoveryCodes();
  await db
    .update(users)
    .set({
      totpSecret: user.totpPendingSecret,
      totpPendingSecret: null,
      totpEnabledAt: new Date(),
      totpLastStep: step,
      recoveryCodeHashes: recoveryCodes.map(recoveryCodeHash),
    })
    .where(eq(users.id, user.id));
  // Other sessions were signed in with only a password; make them sign in again with the second factor.
  await revokeUserSessions(db, user.id, c.get("sessionId"));
  await audit(c, "account.2fa.enable");
  return c.json({ recoveryCodes } satisfies RecoveryCodesResponse);
});

/** Turns 2FA off. Needs both the password and a current code, so a hijacked session alone can't do it. */
app.post("/2fa/disable", async (c) => {
  const { db, config } = c.var;
  const body = totpDisableRequestSchema.parse(await c.req.json());
  const user = await confirmPassword(c, body.password);
  if (!isTwoFactorEnabled(user)) throw new AppError("CONFLICT", "Two-factor authentication is already off");
  if (!(await verifyUserTotp(db, config, user, body.code))) {
    await checkRateLimit(db, `reauth:${user.id}`, REAUTH_LIMIT);
    throw new AppError("VALIDATION_ERROR", "That code didn't work. Try the newest one.");
  }
  await db
    .update(users)
    .set({ totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] })
    .where(eq(users.id, user.id));
  await audit(c, "account.2fa.disable");
  return c.json({ ok: true });
});

/** Replaces all recovery codes (e.g. after using some, or if the old list may have leaked). */
app.post("/2fa/recovery-codes", async (c) => {
  const { db } = c.var;
  const body = regenerateRecoveryCodesRequestSchema.parse(await c.req.json());
  const user = await confirmPassword(c, body.password);
  if (!isTwoFactorEnabled(user)) throw new AppError("PRECONDITION_FAILED", "Turn on two-factor authentication first");
  const recoveryCodes = generateRecoveryCodes();
  await db.update(users).set({ recoveryCodeHashes: recoveryCodes.map(recoveryCodeHash) }).where(eq(users.id, user.id));
  await audit(c, "account.2fa.recovery-codes");
  return c.json({ recoveryCodes } satisfies RecoveryCodesResponse);
});

/** Where this account is signed in. */
app.get("/sessions", async (c) => {
  const rows = await c.var.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, c.get("user").id), eq(sessions.mfaPending, false), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
  const current = c.get("sessionId");
  return c.json({
    sessions: rows.map(
      (s): SessionInfo => ({
        id: s.id,
        current: s.id === current,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
      }),
    ),
  });
});

app.post("/sessions/revoke-others", async (c) => {
  await revokeUserSessions(c.var.db, c.get("user").id, c.get("sessionId"));
  await audit(c, "account.sessions.revoke-others");
  return c.json({ ok: true });
});

app.delete("/sessions/:id", async (c) => {
  const deleted = await c.var.db
    .delete(sessions)
    .where(and(eq(sessions.id, z.string().uuid().parse(c.req.param("id"))), eq(sessions.userId, c.get("user").id)))
    .returning({ id: sessions.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND", "Session not found");
  await audit(c, "account.sessions.revoke");
  return c.json({ ok: true });
});

export default app;
