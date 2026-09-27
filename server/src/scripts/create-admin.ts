import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { users } from "../db/schema";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

// authGate only lets in identities with an active users row, so the first
// admin has to be created out of band. The identity is the Access email, or
// BASIC_AUTH_USERNAME in basic mode (the default when no argument is given).
async function main() {
  const identity = process.argv[2] ?? process.env.BASIC_AUTH_USERNAME;
  const displayName = process.argv[3] ?? identity;
  if (!identity) {
    console.error("Usage: pnpm --filter server run create-admin <identity> [display name]");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);
  await db
    .insert(users)
    .values({ identity, displayName: displayName!, role: "admin" })
    .onConflictDoUpdate({ target: users.identity, set: { role: "admin", status: "active" } });
  await sql.end();

  console.log(`Admin "${identity}" is ready.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
