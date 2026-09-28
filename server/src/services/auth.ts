import { and, count, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { AppError, usesPasswordLogin, type AuthStatus } from "@r2-manager/shared";
import type { AppConfig } from "../config";
import type { Database } from "../db/client";
import { appSettings, passwordResetTokens, users } from "../db/schema";
import { decryptSecret, generateToken, hashPassword, hashToken, verifyPassword } from "./crypto";
import { isMailConfigured } from "./mailer";
import { recoveryCodeHash, verifyTotp } from "./totp";

type UserRow = typeof users.$inferSelect;

const SETUP_KEY = "setup";

/** Reset links are short-lived; invite links give a new user a few days to notice the email. */
export const RESET_TOKEN_MINUTES = 60;
export const INVITE_TOKEN_HOURS = 72;

/**
 * First-run registration is open until an admin who can sign in exists. Once one does, a flag is
 * persisted so setup never reopens, even if every admin is later disabled: recovering from that is
 * a job for the create-admin CLI (with database access), not for whoever reaches the site first.
 */
export async function isSetupRequired(db: Database, config: AppConfig): Promise<boolean> {
  const flag = await db.query.appSettings.findFirst({ where: eq(appSettings.key, SETUP_KEY) });
  if (flag) return false;

  const canSignIn = usesPasswordLogin(config.env.AUTH_MODE) ? isNotNull(users.passwordHash) : undefined;
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active"), canSignIn));
  if ((row?.n ?? 0) === 0) return true;

  await markSetupComplete(db);
  return false;
}

export async function markSetupComplete(db: Database): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: SETUP_KEY, value: { completedAt: new Date().toISOString() } })
    .onConflictDoNothing();
}

export async function getAuthStatus(db: Database, config: AppConfig): Promise<AuthStatus> {
  const [setupRequired, mailConfigured] = await Promise.all([isSetupRequired(db, config), isMailConfigured(db)]);
  return {
    authMode: config.env.AUTH_MODE,
    setupRequired,
    setupTokenRequired: setupRequired && !!config.env.SETUP_TOKEN,
    passwordResetAvailable: usesPasswordLogin(config.env.AUTH_MODE) && mailConfigured,
  };
}

/** Throws unless this deployment has password sign-in turned on. */
export function assertPasswordLogin(config: AppConfig): void {
  if (!usesPasswordLogin(config.env.AUTH_MODE)) {
    throw new AppError("NOT_FOUND", "Password sign-in is turned off for this deployment (AUTH_MODE=access)");
  }
}

// Verifying against this when the email is unknown makes a miss cost the same scrypt time as a hit,
// so response times don't reveal which emails have accounts.
let dummyHash: Promise<string> | undefined;

/** The active user with this email and password, or null. Takes the same time either way. */
export async function checkPassword(db: Database, email: string, password: string): Promise<UserRow | null> {
  const user = await db.query.users.findFirst({ where: eq(users.identity, email) });
  const hash = user?.passwordHash ?? (await (dummyHash ??= hashPassword(generateToken(16))));
  const ok = await verifyPassword(password, hash);
  return ok && user?.passwordHash && user.status === "active" ? user : null;
}

export async function setPassword(db: Database, userId: string, password: string): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
    .where(eq(users.id, userId));
  // Any outstanding reset/invite link is for the old password; don't let it undo this change.
  await db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
}

/** Creates a single-use reset/invite link token. Returns the raw token for the email; only its hash is stored. */
export async function createPasswordResetToken(
  db: Database,
  userId: string,
  purpose: "reset" | "invite",
): Promise<string> {
  const token = generateToken(32);
  const ttlMs = purpose === "invite" ? INVITE_TOKEN_HOURS * 3_600_000 : RESET_TOKEN_MINUTES * 60_000;
  await db.insert(passwordResetTokens).values({
    tokenHash: hashToken(token),
    userId,
    purpose,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

/**
 * Burns a reset token and returns its user. One conditional UPDATE, so two concurrent requests with the
 * same link can't both succeed.
 */
export async function consumePasswordResetToken(db: Database, token: string): Promise<UserRow> {
  const [row] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: passwordResetTokens.userId });
  const user = row ? await db.query.users.findFirst({ where: eq(users.id, row.userId) }) : undefined;
  if (!user || user.status !== "active") {
    throw new AppError("VALIDATION_ERROR", "This link is invalid or has expired. Ask for a new one.");
  }
  return user;
}

export function resetLink(config: AppConfig, token: string, purpose: "reset" | "invite"): string {
  // In the fragment, not the query string, so the token never reaches server or proxy access logs.
  const params = new URLSearchParams({ token });
  if (purpose === "invite") params.set("invite", "1");
  return `${config.env.APP_BASE_URL.replace(/\/$/, "")}/reset-password#${params.toString()}`;
}

/** Cron: removes spent and expired reset links. */
export async function deleteExpiredResetTokens(db: Database): Promise<number> {
  const deleted = await db
    .delete(passwordResetTokens)
    .where(or(lt(passwordResetTokens.expiresAt, new Date()), isNotNull(passwordResetTokens.usedAt)))
    .returning({ id: passwordResetTokens.id });
  return deleted.length;
}

export function isTwoFactorEnabled(user: Pick<UserRow, "totpSecret" | "totpEnabledAt">): boolean {
  return !!user.totpSecret && !!user.totpEnabledAt;
}

/**
 * Checks a 6-digit code against the user's enabled TOTP secret and records its step, all-or-nothing:
 * the UPDATE only succeeds if no other request has used this step (or a later one) in the meantime.
 */
export async function verifyUserTotp(db: Database, config: AppConfig, user: UserRow, code: string): Promise<boolean> {
  if (!user.totpSecret) return false;
  const step = verifyTotp(decryptSecret(user.totpSecret, config.env.SESSION_SECRET), code, user.totpLastStep);
  if (step === null) return false;
  const updated = await db
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id });
  return updated.length > 0;
}

/** Spends one recovery code. Atomic, so a code can't be used twice by racing requests. */
export async function consumeRecoveryCode(db: Database, userId: string, code: string): Promise<boolean> {
  const hash = recoveryCodeHash(code);
  const updated = await db
    .update(users)
    .set({ recoveryCodeHashes: sql`array_remove(${users.recoveryCodeHashes}, ${hash})` })
    .where(and(eq(users.id, userId), sql`${hash} = ANY(${users.recoveryCodeHashes})`))
    .returning({ id: users.id });
  return updated.length > 0;
}
