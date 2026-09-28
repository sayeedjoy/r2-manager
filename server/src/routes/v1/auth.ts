import { Hono, type Context } from "hono";
import { eq, sql } from "drizzle-orm";
import {
  AppError,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  loginVerifyRequestSchema,
  resetPasswordRequestSchema,
  setupRequestSchema,
  usesPasswordLogin,
  type LoginResponse,
} from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { users } from "../../db/schema";
import { accessJwt } from "../../middleware/access-jwt";
import { checkRateLimit, isRateLimited, type RateLimitOptions } from "../../middleware/rate-limit";
import { recordAudit } from "../../services/audit";
import {
  assertPasswordLogin,
  checkPassword,
  consumePasswordResetToken,
  consumeRecoveryCode,
  createPasswordResetToken,
  getAuthStatus,
  isSetupRequired,
  isTwoFactorEnabled,
  markSetupComplete,
  RESET_TOKEN_MINUTES,
  resetLink,
  setPassword,
  verifyUserTotp,
} from "../../services/auth";
import { hashPassword, timingSafeStringEqual } from "../../services/crypto";
import { passwordChangedEmail, passwordResetEmail } from "../../services/email-templates";
import { isMailConfigured, sendMail } from "../../services/mailer";
import {
  clearSessionCookie,
  deleteSession,
  readSession,
  requestIp,
  revokeUserSessions,
  startSession,
} from "../../services/sessions";

const app = new Hono<HonoEnv>();

// Failed-attempt budgets. Only failures count, so a user who types their password right is never locked out by them.
const LOGIN_PER_IP: RateLimitOptions = { max: 20, windowSeconds: 15 * 60 };
const LOGIN_PER_EMAIL: RateLimitOptions = { max: 10, windowSeconds: 15 * 60 };
const MFA_PER_USER: RateLimitOptions = { max: 10, windowSeconds: 15 * 60 };
const SETUP_PER_IP: RateLimitOptions = { max: 10, windowSeconds: 15 * 60 };
// Every request counts for these: each one can send an email.
const FORGOT_PER_IP: RateLimitOptions = { max: 5, windowSeconds: 15 * 60 };
const FORGOT_PER_EMAIL: RateLimitOptions = { max: 3, windowSeconds: 60 * 60 };
const RESET_PER_IP: RateLimitOptions = { max: 10, windowSeconds: 15 * 60 };

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

async function refuseIfLimited(c: Context<HonoEnv>, ...checks: [string, RateLimitOptions][]) {
  for (const [key, opts] of checks) {
    if (await isRateLimited(c.var.db, key, opts)) throw new AppError("RATE_LIMITED", TOO_MANY);
  }
}

async function countAttempt(c: Context<HonoEnv>, ...checks: [string, RateLimitOptions][]) {
  for (const [key, opts] of checks) await checkRateLimit(c.var.db, key, opts);
}

// Auth responses carry session state; never let a proxy or the browser cache them.
app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
app.use("*", accessJwt());

/** What the sign-in screens need to know before anyone is signed in. Public. */
app.get("/status", async (c) => {
  return c.json(await getAuthStatus(c.var.db, c.var.config));
});

/**
 * First-run registration of the first admin. Open only while isSetupRequired(); serialized with an advisory
 * lock so two browsers racing through setup can't both create an admin.
 */
app.post("/setup", async (c) => {
  const { db, config } = c.var;
  const mode = config.env.AUTH_MODE;
  const ip = requestIp(c);
  await refuseIfLimited(c, [`setup:${ip}`, SETUP_PER_IP]);
  const body = setupRequestSchema.parse(await c.req.json());

  if (config.env.SETUP_TOKEN) {
    if (!body.setupToken || !timingSafeStringEqual(body.setupToken, config.env.SETUP_TOKEN)) {
      await countAttempt(c, [`setup:${ip}`, SETUP_PER_IP]);
      throw new AppError("UNAUTHORIZED", "The setup token is incorrect");
    }
  }

  const accessEmail = c.get("accessIdentity")?.email;
  let email: string;
  if (mode === "password") {
    if (!body.email) throw new AppError("VALIDATION_ERROR", "Enter your email");
    email = body.email;
  } else {
    if (!accessEmail) throw new AppError("UNAUTHENTICATED", "Sign in with Cloudflare Access first");
    if (body.email && body.email !== accessEmail) {
      throw new AppError("VALIDATION_ERROR", `Use the email you signed in to Cloudflare Access with (${accessEmail})`);
    }
    email = accessEmail;
  }
  if (usesPasswordLogin(mode) && !body.password) throw new AppError("VALIDATION_ERROR", "Choose a password");
  const passwordHash = body.password && usesPasswordLogin(mode) ? await hashPassword(body.password) : null;

  const admin = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('r2-manager:setup'))`);
    if (!(await isSetupRequired(tx as unknown as typeof db, config))) {
      throw new AppError("CONFLICT", "Setup is already complete. Sign in instead.");
    }
    const [row] = await tx
      .insert(users)
      .values({
        identity: email,
        displayName: body.displayName,
        role: "admin",
        passwordHash,
        passwordChangedAt: passwordHash ? new Date() : null,
      })
      // An existing row (e.g. the old Basic Auth admin, or an Access user) is promoted rather than duplicated.
      .onConflictDoUpdate({
        target: users.identity,
        set: { displayName: body.displayName, role: "admin", status: "active", passwordHash, passwordChangedAt: new Date() },
      })
      .returning();
    await markSetupComplete(tx as unknown as typeof db);
    return row!;
  });

  if (usesPasswordLogin(mode)) {
    await startSession(c, admin.id, { mfaPending: false });
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, admin.id));
  }
  await recordAudit(db, {
    actorId: admin.id,
    action: "auth.setup",
    target: admin.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json({ ok: true });
});

/** AUTH-02: email + password sign-in. Accounts with 2FA get a pending session that only /login/verify accepts. */
app.post("/login", async (c) => {
  const { db, config } = c.var;
  assertPasswordLogin(config);
  const body = loginRequestSchema.parse(await c.req.json());
  const ip = requestIp(c);
  const limits: [string, RateLimitOptions][] = [
    [`login-ip:${ip}`, LOGIN_PER_IP],
    [`login-email:${body.email}`, LOGIN_PER_EMAIL],
  ];
  // A locked-out address or account is refused before its password is checked.
  await refuseIfLimited(c, ...limits);

  const user = await checkPassword(db, body.email, body.password);
  if (!user) {
    await countAttempt(c, ...limits);
    await recordAudit(db, {
      actorId: null,
      action: "auth.login",
      target: body.email,
      outcome: "failure",
      correlationId: c.get("correlationId"),
      details: { ip },
    });
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password");
  }

  if (config.env.AUTH_MODE === "both" && c.get("accessIdentity")?.email !== user.identity) {
    throw new AppError("UNAUTHORIZED", "Sign in with the same email you use for Cloudflare Access");
  }

  // A fresh login replaces whatever session this browser had.
  const previous = await readSession(c);
  if (previous) await deleteSession(db, previous.session.id);

  const mfaRequired = isTwoFactorEnabled(user);
  await startSession(c, user.id, { mfaPending: mfaRequired });
  if (!mfaRequired) {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await recordAudit(db, {
      actorId: user.id,
      action: "auth.login",
      target: user.identity,
      outcome: "success",
      correlationId: c.get("correlationId"),
      details: { ip },
    });
  }
  return c.json({ mfaRequired } satisfies LoginResponse);
});

/** Second step for 2FA accounts: a code from the authenticator app, or a one-time recovery code. */
app.post("/login/verify", async (c) => {
  const { db, config } = c.var;
  assertPasswordLogin(config);
  const found = await readSession(c);
  if (!found || !found.session.mfaPending) {
    throw new AppError("UNAUTHENTICATED", "Your sign-in timed out. Enter your password again.");
  }
  const { session, user } = found;
  const limit: [string, RateLimitOptions] = [`mfa:${user.id}`, MFA_PER_USER];
  await refuseIfLimited(c, limit);

  const body = loginVerifyRequestSchema.parse(await c.req.json());
  const ok =
    "code" in body
      ? await verifyUserTotp(db, config, user, body.code)
      : await consumeRecoveryCode(db, user.id, body.recoveryCode);

  if (!ok || user.status !== "active") {
    await countAttempt(c, limit);
    await recordAudit(db, {
      actorId: user.id,
      action: "auth.login.2fa",
      target: user.identity,
      outcome: "failure",
      correlationId: c.get("correlationId"),
    });
    throw new AppError("UNAUTHENTICATED", "code" in body ? "That code didn't work. Try the newest one." : "That recovery code isn't valid.");
  }

  // Swap the pending session for a full one with a new token.
  await deleteSession(db, session.id);
  await startSession(c, user.id, { mfaPending: false });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await recordAudit(db, {
    actorId: user.id,
    action: "auth.login",
    target: user.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { ip: requestIp(c), method: "code" in body ? "totp" : "recovery-code" },
  });
  return c.json({ ok: true });
});

app.post("/logout", async (c) => {
  const found = await readSession(c);
  if (found) {
    await deleteSession(c.var.db, found.session.id);
    await recordAudit(c.var.db, {
      actorId: found.user.id,
      action: "auth.logout",
      target: found.user.identity,
      outcome: "success",
      correlationId: c.get("correlationId"),
    });
  }
  clearSessionCookie(c);
  return c.body(null, 204);
});

/**
 * Emails a reset link. The response is the same whether or not the email has an account, so this can't be used to
 * find out who does.
 */
app.post("/password/forgot", async (c) => {
  const { db, config } = c.var;
  assertPasswordLogin(config);
  const ip = requestIp(c);
  await refuseIfLimited(c, [`forgot-ip:${ip}`, FORGOT_PER_IP]);
  await countAttempt(c, [`forgot-ip:${ip}`, FORGOT_PER_IP]);
  const { email } = forgotPasswordRequestSchema.parse(await c.req.json());

  if (!(await isMailConfigured(db))) {
    throw new AppError("PRECONDITION_FAILED", "Password reset by email isn't available. Ask an administrator to reset your password.");
  }

  const emailLimit: [string, RateLimitOptions] = [`forgot-email:${email}`, FORGOT_PER_EMAIL];
  const user = await db.query.users.findFirst({ where: eq(users.identity, email) });
  if (user && user.status === "active" && !(await isRateLimited(db, ...emailLimit))) {
    await countAttempt(c, emailLimit);
    const token = await createPasswordResetToken(db, user.id, "reset");
    try {
      await sendMail(db, config, passwordResetEmail(user.identity, user.displayName, resetLink(config, token, "reset"), RESET_TOKEN_MINUTES));
    } catch (err) {
      // Don't tell the requester; they might not be the account owner. Admins see it in the log and audit trail.
      console.error(`[${c.get("correlationId")}] password reset email failed`, err);
    }
    await recordAudit(db, {
      actorId: user.id,
      action: "auth.password.reset-request",
      target: user.identity,
      outcome: "success",
      correlationId: c.get("correlationId"),
      details: { ip },
    });
  }
  return c.json({ ok: true });
});

/** Sets a new password from an emailed reset or invite link, then signs the user out everywhere. */
app.post("/password/reset", async (c) => {
  const { db, config } = c.var;
  assertPasswordLogin(config);
  const ip = requestIp(c);
  const limit: [string, RateLimitOptions] = [`reset-ip:${ip}`, RESET_PER_IP];
  await refuseIfLimited(c, limit);
  const body = resetPasswordRequestSchema.parse(await c.req.json());

  let user;
  try {
    user = await consumePasswordResetToken(db, body.token);
  } catch (err) {
    await countAttempt(c, limit);
    throw err;
  }
  await setPassword(db, user.id, body.password);
  await revokeUserSessions(db, user.id);
  clearSessionCookie(c);

  await recordAudit(db, {
    actorId: user.id,
    action: "auth.password.reset",
    target: user.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { ip },
  });
  // A heads-up in case the reset wasn't them. Best effort: the reset itself already succeeded.
  if (user.passwordHash) {
    await sendMail(db, config, passwordChangedEmail(user.identity, user.displayName)).catch(() => {});
  }
  return c.json({ ok: true });
});

export default app;
