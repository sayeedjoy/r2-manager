import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import type { Env } from "../config";

let sqlClient: postgres.Sql | undefined;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Vercel functions are short-lived, so use a small pool there; Dokploy runs a
 * long-lived Node process and can hold more connections.
 */
export function createDb(env: Env) {
  if (dbInstance) return dbInstance;
  const isServerless = !!process.env.VERCEL;
  sqlClient = postgres(env.DATABASE_URL, {
    max: isServerless ? 1 : 10,
    idle_timeout: isServerless ? 20 : undefined,
  });
  dbInstance = drizzle(sqlClient, { schema });
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  await sqlClient?.end({ timeout: 5 });
  sqlClient = undefined;
  dbInstance = undefined;
}

export type Database = ReturnType<typeof createDb>;
