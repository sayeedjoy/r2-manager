import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

export interface RateLimitOptions {
  max: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Fixed-window rate limiter backed by Postgres (no Redis dependency, per
 * project-structure.md). Uses an upsert + conditional reset so concurrent
 * requests in the same window still count correctly.
 */
export async function checkRateLimit(db: Database, key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const rows = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - (${opts.windowSeconds} || ' seconds')::interval
          THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - (${opts.windowSeconds} || ' seconds')::interval
          THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count
  `);

  const count = Number((rows as unknown as { count: number }[])[0]?.count ?? 1);
  return { allowed: count <= opts.max, remaining: Math.max(0, opts.max - count) };
}

/** Read-only: whether `key` has already used up its window, without counting this call. */
export async function isRateLimited(db: Database, key: string, opts: RateLimitOptions): Promise<boolean> {
  const rows = await db.execute<{ count: number }>(sql`
    SELECT count FROM rate_limits
    WHERE key = ${key}
      AND window_start >= now() - (${opts.windowSeconds} || ' seconds')::interval
  `);
  const count = Number((rows as unknown as { count: number }[])[0]?.count ?? 0);
  return count >= opts.max;
}
