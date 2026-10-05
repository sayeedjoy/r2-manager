import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { isDemoMode } from "../config";

// Load the repo-root .env regardless of cwd; see entry/node.ts for why.
loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

async function main() {
  // DEMO_MODE has no database. Skip even when a DATABASE_URL is left in the environment, so a demo can't touch it.
  if (isDemoMode()) {
    console.warn("DEMO_MODE is on: there is no database, so no migrations were run.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to run migrations");

  // onnotice: drizzle's "schema already exists, skipping" notices would otherwise flood every container start.
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  await sql.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
