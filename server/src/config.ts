import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AppError, AUTH_MODES } from "@r2-manager/shared";

/**
 * Hosting panels and `docker --env-file` can hand over a flag as `"true"` (quotes kept), `True` or with stray
 * whitespace. Read past those, so DEMO_MODE=True doesn't quietly mean "off" and send the container to Postgres.
 */
function normalizeFlag(value: string | undefined): string | undefined {
  const flag = value
    ?.trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim()
    .toLowerCase();
  return flag || undefined;
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    APP_BASE_URL: z.string().url(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),

    DATABASE_URL: z.string().min(1),

    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKETS: z.string().min(1),
    R2_ENDPOINT: z.string().url().optional(),

    AUTH_MODE: z.enum(AUTH_MODES, {
      errorMap: () => ({
        message: `must be one of ${AUTH_MODES.join(", ")} ("basic" was replaced by "password": email + password sign-in)`,
      }),
    }),
    ACCESS_TEAM_DOMAIN: z.string().optional(),
    ACCESS_AUD: z.string().optional(),
    // Signs share cookies and derives the key that encrypts TOTP secrets and the SMTP password at rest.
    // Changing it disables everyone's 2FA secrets and the saved SMTP password, so treat it as permanent.
    SESSION_SECRET: z.string().min(32),
    // Optional: when set, first-run admin registration (/setup) also asks for this value.
    SETUP_TOKEN: z.string().min(16).optional(),

    CRON_SECRET: z.string().min(32).optional(),

    // Public demo site: sample files in memory, no database, one shared demo sign-in, every write refused.
    DEMO_MODE: z.preprocess(
      (v) => (typeof v === "string" ? normalizeFlag(v) : v),
      z
        .enum(["true", "false", "1", "0"])
        .default("false")
        .transform((v) => v === "true" || v === "1"),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (new URL(env.APP_BASE_URL).protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APP_BASE_URL"],
          message: "must use https in production",
        });
      }
      if (env.R2_ENDPOINT && new URL(env.R2_ENDPOINT).protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["R2_ENDPOINT"],
          message: "must use https in production",
        });
      }
    }
    // AUTH-03: deployment must select Access, password login, or both; refuse to start unconfigured.
    if (env.AUTH_MODE === "access" || env.AUTH_MODE === "both") {
      if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "ACCESS_TEAM_DOMAIN and ACCESS_AUD are required when AUTH_MODE includes 'access'",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env;
  buckets: string[];
  r2Endpoint: string;
  /** DEMO_MODE: storage is the in-memory sample set and Postgres is never contacted (see server/src/demo/). */
  demo: boolean;
}

let cached: AppConfig | undefined;

/**
 * `.env` files commonly leave optional keys present but blank (as in
 * .env.example). Treat "" the same as unset so optional fields like
 * R2_ENDPOINT don't fail url validation just for being empty.
 */
function blankToUndefined(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = value === "" ? undefined : value;
  }
  return result;
}

const DEMO_FLAG = /^(true|1)$/;
export const DEMO_BUCKET = "demo-bucket";

/** For the scripts that talk to Postgres without loading the full config (db/migrate.ts, scripts/create-admin.ts). */
export function isDemoMode(source: NodeJS.ProcessEnv = process.env): boolean {
  return DEMO_FLAG.test(normalizeFlag(source.DEMO_MODE) ?? "");
}

/**
 * DEMO_MODE needs no database, bucket credentials or auth setup, but the schema (and the rest of the server's types)
 * still expects them. Replace them with inert placeholders, overriding anything set: a real database URL, bucket
 * names or keys left in the environment are then never loaded into a public demo, let alone used.
 */
function withDemoOverrides(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!isDemoMode(source)) return source;
  return {
    ...source,
    DATABASE_URL: "postgres://demo.invalid/demo",
    R2_ACCOUNT_ID: "demo",
    R2_ACCESS_KEY_ID: "demo",
    R2_SECRET_ACCESS_KEY: "demo",
    R2_BUCKETS: DEMO_BUCKET,
    R2_ENDPOINT: undefined,
    AUTH_MODE: "password",
    ACCESS_TEAM_DOMAIN: undefined,
    ACCESS_AUD: undefined,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    SETUP_TOKEN: undefined,
    CRON_SECRET: undefined,
  };
}

/** Parses and validates process.env. Throws (refuses to start) if auth is unconfigured (AUTH-03). */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(withDemoOverrides(blankToUndefined(source)));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server configuration:\n${details}`);
  }

  const env = parsed.data;
  const buckets = env.R2_BUCKETS.split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  if (buckets.length === 0) {
    throw new Error("R2_BUCKETS must list at least one bucket");
  }

  cached = {
    env,
    buckets,
    r2Endpoint:
      env.R2_ENDPOINT ??
      `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    demo: env.DEMO_MODE,
  };
  return cached;
}

export function assertBucketConfigured(
  config: AppConfig,
  bucket: string,
): void {
  if (!config.buckets.includes(bucket)) {
    throw new AppError(
      "NOT_FOUND",
      `Bucket "${bucket}" is not configured for this deployment`,
    );
  }
}

/** Test-only: clears the cached config so a new env can be loaded. */
export function resetConfigForTests(): void {
  cached = undefined;
}
