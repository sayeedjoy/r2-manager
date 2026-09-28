import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Load the repo-root .env regardless of cwd; see entry/node.ts for why.
loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

async function main() {
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
