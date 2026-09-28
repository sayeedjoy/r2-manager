import { z } from "zod";

export const SMTP_PROVIDERS = ["gmail", "brevo", "custom"] as const;
export type SmtpProvider = (typeof SMTP_PROVIDERS)[number];

/**
 * Connection presets. Gmail needs an app password (Google Account -> Security -> App passwords) since
 * it refuses plain account passwords over SMTP; Brevo uses the SMTP key from its "SMTP & API" page.
 */
export const SMTP_PRESETS: Record<Exclude<SmtpProvider, "custom">, { host: string; port: number; secure: boolean }> = {
  gmail: { host: "smtp.gmail.com", port: 465, secure: true },
  brevo: { host: "smtp-relay.brevo.com", port: 587, secure: false },
};

/** What the admin API returns: the password itself never leaves the server. */
export const smtpSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(SMTP_PROVIDERS),
  host: z.string(),
  port: z.number().int(),
  /** true = implicit TLS (usually 465); false = STARTTLS, which the mailer then requires (usually 587). */
  secure: z.boolean(),
  username: z.string(),
  passwordSet: z.boolean(),
  fromEmail: z.string(),
  fromName: z.string(),
  updatedAt: z.string().datetime().nullable(),
});
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;

export const updateSmtpSettingsSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(SMTP_PROVIDERS),
    host: z.string().trim().max(255),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string().trim().max(320),
    /** Omit (or send blank) to keep the stored password. */
    password: z.string().max(1024).optional(),
    fromEmail: z.string().trim().max(320),
    fromName: z.string().trim().max(100),
  })
  .superRefine((v, ctx) => {
    if (!v.enabled) return;
    if (!v.host) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["host"], message: "Enter the SMTP host" });
    if (!z.string().email().safeParse(v.fromEmail).success)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fromEmail"], message: "Enter a valid sender address" });
  });
export type UpdateSmtpSettings = z.infer<typeof updateSmtpSettingsSchema>;

export const sendTestEmailSchema = z.object({ to: z.string().trim().email() });
