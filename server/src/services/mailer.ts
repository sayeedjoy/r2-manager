import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { AppError, type SmtpSettings, type UpdateSmtpSettings } from "@r2-manager/shared";
import type { AppConfig } from "../config";
import type { Database } from "../db/client";
import { appSettings } from "../db/schema";
import { decryptSecret, encryptSecret } from "./crypto";

const SMTP_KEY = "smtp";

/** What's stored under app_settings "smtp". The password is encrypted with encryptSecret(). */
interface StoredSmtp {
  enabled: boolean;
  provider: SmtpSettings["provider"];
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEncrypted: string | null;
  fromEmail: string;
  fromName: string;
}

const DEFAULT_SMTP: StoredSmtp = {
  enabled: false,
  provider: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  username: "",
  passwordEncrypted: null,
  fromEmail: "",
  fromName: "R2 Manager",
};

async function readStored(db: Database): Promise<{ value: StoredSmtp; updatedAt: Date | null }> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, SMTP_KEY) });
  if (!row) return { value: DEFAULT_SMTP, updatedAt: null };
  return { value: { ...DEFAULT_SMTP, ...(row.value as Partial<StoredSmtp>) }, updatedAt: row.updatedAt };
}

/** Admin view of the SMTP settings (never includes the password). */
export async function getSmtpSettings(db: Database): Promise<SmtpSettings> {
  const { value, updatedAt } = await readStored(db);
  const { passwordEncrypted, ...rest } = value;
  return { ...rest, passwordSet: !!passwordEncrypted, updatedAt: updatedAt?.toISOString() ?? null };
}

export async function updateSmtpSettings(
  db: Database,
  config: AppConfig,
  input: UpdateSmtpSettings,
): Promise<SmtpSettings> {
  const { value: current } = await readStored(db);
  const { password, ...rest } = input;
  const next: StoredSmtp = {
    ...rest,
    // Blank keeps the saved password, so the form doesn't have to round-trip a secret it can't read.
    passwordEncrypted: password ? encryptSecret(password, config.env.SESSION_SECRET) : current.passwordEncrypted,
  };
  await db
    .insert(appSettings)
    .values({ key: SMTP_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } });
  return getSmtpSettings(db);
}

export async function isMailConfigured(db: Database): Promise<boolean> {
  const { value } = await readStored(db);
  return value.enabled && !!value.host && !!value.fromEmail;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends one email with the saved SMTP settings. Throws AppError("PRECONDITION_FAILED") if SMTP isn't set up. */
export async function sendMail(db: Database, config: AppConfig, mail: OutgoingMail): Promise<void> {
  const { value: smtp } = await readStored(db);
  if (!smtp.enabled || !smtp.host || !smtp.fromEmail) {
    throw new AppError("PRECONDITION_FAILED", "Email delivery isn't set up. An admin can configure SMTP under Email delivery.");
  }

  let pass: string | undefined;
  if (smtp.passwordEncrypted) {
    try {
      pass = decryptSecret(smtp.passwordEncrypted, config.env.SESSION_SECRET);
    } catch {
      throw new AppError("PRECONDITION_FAILED", "The saved SMTP password can't be read (SESSION_SECRET changed?). Enter it again.");
    }
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // Without implicit TLS, insist on STARTTLS instead of silently sending credentials in the clear.
    requireTLS: !smtp.secure,
    auth: smtp.username ? { user: smtp.username, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transport.sendMail({
      from: { name: smtp.fromName || "R2 Manager", address: smtp.fromEmail },
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } catch (err) {
    // SMTP errors ("535 Authentication failed", "ECONNREFUSED") are what an admin needs to fix the settings.
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError("UPSTREAM_ERROR", `The SMTP server refused the message: ${message}`);
  } finally {
    transport.close();
  }
}
