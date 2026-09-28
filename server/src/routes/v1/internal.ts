import { Hono } from "hono";
import { AppError } from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import {
  verifyWebhookSignature,
  ingestMessage,
  mailWebhookPayloadSchema,
} from "../../mail/ingest";
import { cleanupExpiredUploads } from "../../jobs/upload-cleanup";
import { readTextBodyWithLimit } from "../../services/request-body";
import { assertBucketConfigured } from "../../config";
import { timingSafeStringEqual } from "../../services/crypto";

const app = new Hono<HonoEnv>();
const MAIL_WEBHOOK_MAX_BYTES = 16 * 1024;

/** MAIL-01/02: receives the signed webhook from the Cloudflare email-relay Worker (see email-relay/src/index.ts). */
app.post("/mail-webhook", async (c) => {
  const { config, db, storage } = c.var;
  const secret = config.env.MAIL_WEBHOOK_SECRET;
  if (!secret)
    return c.json({ error: "Mail ingestion is not configured" }, 501);

  const signature = c.req.header("x-webhook-signature");
  const rawBody = await readTextBodyWithLimit(
    c.req.raw,
    MAIL_WEBHOOK_MAX_BYTES,
  );
  if (!signature || !verifyWebhookSignature(secret, rawBody, signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid JSON request");
  }
  const payload = mailWebhookPayloadSchema.parse(decoded);
  assertBucketConfigured(config, payload.bucket);
  const result = await ingestMessage(db, storage, payload);
  return c.json(result);
});

/** Vercel Cron / Dokploy schedule trigger for background jobs (upload cleanup, retention). */
app.post("/cron", async (c) => {
  const { config, db, storage } = c.var;
  const secret = config.env.CRON_SECRET;
  const provided = c.req.header("x-cron-secret");
  if (!secret || !provided || !timingSafeStringEqual(provided, secret))
    return c.json({ error: "Unauthorized" }, 401);

  const expiredUploads = await cleanupExpiredUploads(db, storage);
  return c.json({ ok: true, expiredUploads });
});

export default app;
