import { z } from "zod";
import { AppError } from "@r2-manager/shared";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    APP_BASE_URL: z.string().url(),

    DATABASE_URL: z.string().min(1),

    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKETS: z.string().min(1),
    R2_ENDPOINT: z.string().url().optional(),

    AUTH_MODE: z.enum(["access", "basic", "both"]),
    ACCESS_TEAM_DOMAIN: z.string().optional(),
    ACCESS_AUD: z.string().optional(),
    BASIC_AUTH_USERNAME: z.string().optional(),
    BASIC_AUTH_PASSWORD_HASH: z.string().optional(),
    SESSION_SECRET: z.string().min(16),

    MAIL_WEBHOOK_SECRET: z.string().optional(),
    CRON_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // AUTH-03: deployment must select Access, Basic, or both; refuse to start unconfigured.
    if (env.AUTH_MODE === "access" || env.AUTH_MODE === "both") {
      if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ACCESS_TEAM_DOMAIN and ACCESS_AUD are required when AUTH_MODE includes 'access'",
        });
      }
    }
    if (env.AUTH_MODE === "basic" || env.AUTH_MODE === "both") {
      if (!env.BASIC_AUTH_USERNAME || !env.BASIC_AUTH_PASSWORD_HASH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD_HASH are required when AUTH_MODE includes 'basic'",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env;
  buckets: string[];
  r2Endpoint: string;
}

let cached: AppConfig | undefined;

/** Parses and validates process.env. Throws (refuses to start) if auth is unconfigured (AUTH-03). */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid server configuration:\n${details}`);
  }

  const env = parsed.data;
  const buckets = env.R2_BUCKETS.split(",").map((b) => b.trim()).filter(Boolean);
  if (buckets.length === 0) {
    throw new Error("R2_BUCKETS must list at least one bucket");
  }

  cached = {
    env,
    buckets,
    r2Endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  };
  return cached;
}

export function assertBucketConfigured(config: AppConfig, bucket: string): void {
  if (!config.buckets.includes(bucket)) {
    throw new AppError("NOT_FOUND", `Bucket "${bucket}" is not configured for this deployment`);
  }
}

/** Test-only: clears the cached config so a new env can be loaded. */
export function resetConfigForTests(): void {
  cached = undefined;
}
