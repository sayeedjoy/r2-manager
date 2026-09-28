import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  AppError,
  adminSetPasswordRequestSchema,
  appSettingsSchema,
  auditQuerySchema,
  normalizeFolderKey,
  sendTestEmailSchema,
  updateSmtpSettingsSchema,
  upsertUserSchema,
  usesPasswordLogin,
} from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { assertBucketConfigured } from "../../config";
import { requireCapability } from "../../services/authz";
import { users, grants } from "../../db/schema";
import type { Database } from "../../db/client";
import { getSettings, updateSettings } from "../../services/settings";
import { listAuditEvents, recordAudit } from "../../services/audit";
import {
  assertPasswordLogin,
  createPasswordResetToken,
  INVITE_TOKEN_HOURS,
  isTwoFactorEnabled,
  RESET_TOKEN_MINUTES,
  resetLink,
  setPassword,
} from "../../services/auth";
import { inviteEmail, passwordResetEmail, testEmail } from "../../services/email-templates";
import { getSmtpSettings, isMailConfigured, sendMail, updateSmtpSettings } from "../../services/mailer";
import { revokeUserSessions } from "../../services/sessions";

const app = new Hono<HonoEnv>();

app.use("*", async (c, next) => {
  await requireCapability(c.get("db"), c.get("user"), "admin:manage");
  await next();
});

app.get("/users", async (c) => {
  const db = c.get("db");
  const rows = await db.query.users.findMany();
  const allGrants = await db.query.grants.findMany();
  return c.json({
    users: rows.map((u) => ({
      id: u.id,
      identity: u.identity,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      hasPassword: !!u.passwordHash,
      twoFactorEnabled: isTwoFactorEnabled(u),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      grants: allGrants
        .filter((g) => g.userId === u.id)
        .map((g) => ({ bucket: g.bucket, prefix: g.prefix })),
    })),
  });
});

app.post("/users", async (c) => {
  const body = upsertUserSchema.parse(await c.req.json());
  const db = c.get("db");
  const normalizedGrants = body.grants.map((grant) => ({
    bucket: grant.bucket,
    prefix: grant.prefix.trim() === "" ? "" : normalizeFolderKey(grant.prefix),
  }));
  for (const grant of normalizedGrants)
    assertBucketConfigured(c.get("config"), grant.bucket);
  const passwordLogin = usesPasswordLogin(c.get("config").env.AUTH_MODE);
  if (passwordLogin && body.sendInvite && !(await isMailConfigured(db))) {
    throw new AppError("PRECONDITION_FAILED", "Set up email delivery before sending invites, or set a password instead");
  }

  const [targetUser] = await db
    .insert(users)
    .values({
      identity: body.identity,
      displayName: body.displayName,
      role: body.role,
    })
    .onConflictDoUpdate({
      target: users.identity,
      set: { displayName: body.displayName, role: body.role },
    })
    .returning();
  if (!targetUser)
    throw new AppError("INTERNAL_ERROR", "Failed to create or update user");

  if (passwordLogin && body.password) {
    await setPassword(db, targetUser.id, body.password);
    await revokeUserSessions(db, targetUser.id, targetUser.id === c.get("user").id ? c.get("sessionId") : undefined);
  }
  if (passwordLogin && body.sendInvite) {
    const token = await createPasswordResetToken(db, targetUser.id, targetUser.passwordHash ? "reset" : "invite");
    const url = resetLink(c.get("config"), token, targetUser.passwordHash ? "reset" : "invite");
    await sendMail(
      db,
      c.get("config"),
      targetUser.passwordHash
        ? passwordResetEmail(targetUser.identity, targetUser.displayName, url, RESET_TOKEN_MINUTES)
        : inviteEmail(targetUser.identity, targetUser.displayName, c.get("user").displayName, url, INVITE_TOKEN_HOURS),
    );
  }

  await db.delete(grants).where(eq(grants.userId, targetUser.id));
  if (normalizedGrants.length > 0) {
    await db
      .insert(grants)
      .values(
        normalizedGrants.map((g) => ({
          userId: targetUser.id,
          bucket: g.bucket,
          prefix: g.prefix,
        })),
      );
  }

  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.user.upsert",
    target: targetUser.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { passwordSet: !!(passwordLogin && body.password), invited: !!(passwordLogin && body.sendInvite) },
  });

  return c.json({ id: targetUser.id });
});

/** AUTH-06: revoke a user's app permissions immediately. */
app.post("/users/:id/disable", async (c) => {
  const db = c.get("db");
  const id = userIdParam(c.req.param("id"));
  if (id === c.get("user").id) throw new AppError("VALIDATION_ERROR", "You can't disable your own account");
  const [user] = await db
    .update(users)
    .set({ status: "disabled" })
    .where(eq(users.id, id))
    .returning();
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  await revokeUserSessions(db, user.id);

  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.user.disable",
    target: user.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json({ ok: true });
});

function userIdParam(id: string): string {
  return z.string().uuid({ message: "Unknown user" }).parse(id);
}

async function findUser(db: Database, id: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userIdParam(id)) });
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  return user;
}

/** Sets a user's password directly (when email isn't set up, or they can't receive it) and signs them out everywhere. */
app.post("/users/:id/password", async (c) => {
  assertPasswordLogin(c.get("config"));
  const { password } = adminSetPasswordRequestSchema.parse(await c.req.json());
  const db = c.get("db");
  const user = await findUser(db, c.req.param("id"));
  await setPassword(db, user.id, password);
  await revokeUserSessions(db, user.id, user.id === c.get("user").id ? c.get("sessionId") : undefined);
  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.user.password.set",
    target: user.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json({ ok: true });
});

/** Emails the user a password reset link, or an invite if they've never had a password. */
app.post("/users/:id/send-reset", async (c) => {
  const config = c.get("config");
  assertPasswordLogin(config);
  const db = c.get("db");
  const user = await findUser(db, c.req.param("id"));
  if (user.status !== "active") throw new AppError("VALIDATION_ERROR", "This user is disabled");
  const purpose = user.passwordHash ? "reset" : "invite";
  const token = await createPasswordResetToken(db, user.id, purpose);
  const url = resetLink(config, token, purpose);
  await sendMail(
    db,
    config,
    purpose === "reset"
      ? passwordResetEmail(user.identity, user.displayName, url, RESET_TOKEN_MINUTES)
      : inviteEmail(user.identity, user.displayName, c.get("user").displayName, url, INVITE_TOKEN_HOURS),
  );
  await recordAudit(db, {
    actorId: c.get("user").id,
    action: purpose === "reset" ? "admin.user.password.send-reset" : "admin.user.invite",
    target: user.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json({ ok: true, purpose });
});

/** For a user who lost their authenticator and their recovery codes. Afterwards they sign in with just a password. */
app.post("/users/:id/disable-2fa", async (c) => {
  assertPasswordLogin(c.get("config"));
  const db = c.get("db");
  const user = await findUser(db, c.req.param("id"));
  await db
    .update(users)
    .set({ totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] })
    .where(eq(users.id, user.id));
  await revokeUserSessions(db, user.id, user.id === c.get("user").id ? c.get("sessionId") : undefined);
  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.user.2fa.disable",
    target: user.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json({ ok: true });
});

/** Outgoing email (password reset, invites) is configured here, not in env vars. */
app.get("/smtp", async (c) => {
  return c.json(await getSmtpSettings(c.get("db")));
});

app.put("/smtp", async (c) => {
  const body = updateSmtpSettingsSchema.parse(await c.req.json());
  const db = c.get("db");
  const next = await updateSmtpSettings(db, c.get("config"), body);
  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.smtp.update",
    outcome: "success",
    correlationId: c.get("correlationId"),
    // Never the password itself, only whether it changed.
    details: { enabled: body.enabled, provider: body.provider, host: body.host, passwordChanged: !!body.password },
  });
  return c.json(next);
});

app.post("/smtp/test", async (c) => {
  const { to } = sendTestEmailSchema.parse(await c.req.json());
  const db = c.get("db");
  let failure: unknown;
  try {
    await sendMail(db, c.get("config"), testEmail(to, c.get("config").env.APP_BASE_URL));
  } catch (err) {
    failure = err;
  }
  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.smtp.test",
    target: to,
    outcome: failure ? "failure" : "success",
    correlationId: c.get("correlationId"),
  });
  if (failure) throw failure;
  return c.json({ ok: true });
});

app.get("/settings", async (c) => {
  return c.json(await getSettings(c.get("db")));
});

app.put("/settings", async (c) => {
  const body = appSettingsSchema.partial().parse(await c.req.json());
  const db = c.get("db");
  const next = await updateSettings(db, body);
  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.settings.update",
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json(next);
});

/** ADMIN-01: audit trail, most recent first, paginated and filterable (?limit, ?offset, ?outcome, ?q). */
app.get("/audit", async (c) => {
  const query = auditQuerySchema.parse(c.req.query());
  return c.json(await listAuditEvents(c.get("db"), query));
});

/** ADMIN-03: deployment health, without exposing secrets. */
app.get("/health", async (c) => {
  const { db, storage, config } = c.var;
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await db.execute("select 1");
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    await storage.list(config.buckets[0]!, "", { limit: 1 });
    checks.storage = "ok";
  } catch {
    checks.storage = "error";
  }

  checks.authMode = "ok"; // reaching this handler already proved auth is configured (AUTH-03)
  checks.mailWebhook = config.env.MAIL_WEBHOOK_SECRET ? "ok" : "error";
  // Password reset and invites need outgoing email; Access-only deployments don't.
  if (usesPasswordLogin(config.env.AUTH_MODE)) checks.smtp = (await isMailConfigured(db)) ? "ok" : "error";

  return c.json({ checks, buckets: config.buckets });
});

export default app;
