import { defineConfig } from "drizzle-kit";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

// Load the repo-root .env regardless of cwd; see server/src/entry/node.ts for why.
loadDotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://user:password@localhost:5432/r2_manager",
  },
});
