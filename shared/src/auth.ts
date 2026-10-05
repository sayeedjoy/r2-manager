import { z } from "zod";

/**
 * AUTH-03: how management routes authenticate.
 * - "password": the app's own email + password login (with optional TOTP 2FA).
 * - "access": Cloudflare Access only; the Access email must match an active user.
 * - "both": Access in front AND a password session, for the same email.
 */
export const AUTH_MODES = ["password", "access", "both"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export function usesPasswordLogin(mode: AuthMode): boolean {
  return mode !== "access";
}

export const PASSWORD_MIN_LENGTH = 10;
/** scrypt cost grows with input length; capping it keeps a login request from being used to burn CPU. */
export const PASSWORD_MAX_LENGTH = 256;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`);

/** Identities are emails, compared case-insensitively, so they're stored trimmed and lowercased. */
export const emailSchema = z
  .string()
  .trim()
  .max(320)
  .email("Enter a valid email address")
  .transform((v) => v.toLowerCase());

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const authStatusSchema = z.object({
  authMode: z.enum(AUTH_MODES),
  /** No admin has been set up yet, so the app shows first-run registration instead of the login page. */
  setupRequired: z.boolean(),
  /** SETUP_TOKEN is set, so first-run registration asks for it. */
  setupTokenRequired: z.boolean(),
  /** SMTP is configured, so "Forgot password?" can actually send an email. */
  passwordResetAvailable: z.boolean(),
  /** DEMO_MODE: a read-only showcase with no setup, password reset, account or admin screens. */
  demo: z.boolean().optional(),
  /** DEMO_MODE: the one shared account. It's public, so the sign-in page shows it. */
  demoLogin: z.object({ email: z.string(), password: z.string() }).optional(),
});
export type AuthStatus = z.infer<typeof authStatusSchema>;

export const setupRequestSchema = z.object({
  email: emailSchema.optional(), // taken from the Access JWT in "access" mode
  displayName: z.string().trim().min(1).max(100),
  password: passwordSchema.optional(), // unused in "access" mode
  setupToken: z.string().max(512).optional(),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const loginVerifyRequestSchema = z.union([
  z.object({ code: totpCodeSchema }),
  z.object({ recoveryCode: z.string().trim().min(1).max(64) }),
]);

export const loginResponseSchema = z.object({
  /** The password was right and the account has 2FA: POST /auth/login/verify next. */
  mfaRequired: z.boolean(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1).max(512),
  password: passwordSchema,
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const totpSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
});
export type TotpSetupResponse = z.infer<typeof totpSetupResponseSchema>;

export const totpEnableRequestSchema = z.object({ code: totpCodeSchema });

export const totpDisableRequestSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  code: totpCodeSchema,
});

export const regenerateRecoveryCodesRequestSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const recoveryCodesResponseSchema = z.object({ recoveryCodes: z.array(z.string()) });
export type RecoveryCodesResponse = z.infer<typeof recoveryCodesResponseSchema>;

export const sessionInfoSchema = z.object({
  id: z.string(),
  current: z.boolean(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const adminSetPasswordRequestSchema = z.object({ password: passwordSchema });
