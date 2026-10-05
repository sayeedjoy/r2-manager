import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { emailSchema, passwordSchema } from "@r2-manager/shared";
import { isDemoMode } from "../config";
import { appSettings, passwordResetTokens, sessions, users } from "../db/schema";
import { hashPassword } from "../services/crypto";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const USAGE = `Usage: pnpm --filter server run create-admin <email> [display name] [--reset-2fa]

Normally the first admin registers in the browser on first run. Use this to recover
when that isn't possible, e.g. the only admin forgot their password and email isn't
set up. It creates or promotes <email> to an active admin, sets a new password
(prompted for, or taken from ADMIN_PASSWORD), and signs that account out everywhere.
With --reset-2fa it also turns off the account's two-factor authentication.`;

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      write.call(rl, s.startsWith(question) ? s : "");
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  // DEMO_MODE has no database or accounts; refuse before a DATABASE_URL left in the environment gets written to.
  if (isDemoMode()) {
    console.error("DEMO_MODE is on: the demo has no database, so there are no accounts to create.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const reset2fa = args.includes("--reset-2fa");
  const [rawEmail, ...nameParts] = args.filter((a) => !a.startsWith("--"));
  const parsedEmail = emailSchema.safeParse(rawEmail ?? "");
  if (!parsedEmail.success) {
    console.error(USAGE);
    process.exit(1);
  }
  const email = parsedEmail.data;
  const displayName = nameParts.join(" ") || email;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const accessOnly = process.env.AUTH_MODE === "access";
  let passwordHash: string | undefined;
  if (!accessOnly) {
    const password = process.env.ADMIN_PASSWORD ?? (await promptHidden("New password: "));
    const checked = passwordSchema.safeParse(password);
    if (!checked.success) {
      console.error(checked.error.issues[0]?.message ?? "Invalid password");
      process.exit(1);
    }
    passwordHash = await hashPassword(password);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);
  const twoFactorReset = reset2fa
    ? { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] }
    : {};
  const passwordFields = passwordHash ? { passwordHash, passwordChangedAt: new Date() } : {};
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ identity: email, displayName, role: "admin", ...passwordFields })
      .onConflictDoUpdate({
        target: users.identity,
        set: { role: "admin", status: "active", ...passwordFields, ...twoFactorReset },
      })
      .returning({ id: users.id });
    await tx.delete(sessions).where(eq(sessions.userId, user!.id));
    // Recovery must invalidate links issued for the password that was just replaced.
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user!.id));
    // An admin now exists, so the browser's first-run setup must stay closed.
    await tx
      .insert(appSettings)
      .values({ key: "setup", value: { completedAt: new Date().toISOString() } })
      .onConflictDoNothing();
  });
  await sql.end();

  console.log(`Admin "${email}" is ready.${reset2fa ? " Two-factor authentication is off." : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
