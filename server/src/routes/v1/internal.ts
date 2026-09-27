import { Hono } from "hono";
import type { HonoEnv } from "../../types";
import { verifyWebhookSignature, ingestMessage } from "../../mail/ingest";
import { cleanupExpiredUploads } from "../../jobs/upload-cleanup";

const app = new Hono<HonoEnv>();

/** MAIL-01/02: receives the signed webhook from the Cloudflare email-relay Worker (see email-relay/src/index.ts). */
app.post("/mail-webhook", async (c) => {
  const { config, db, storage } = c.var;
  const secret = config.env.MAIL_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "Mail ingestion is not configured" }, 501);

  const signature = c.req.header("x-webhook-signature");
  const rawBody = await c.req.text();
  if (!signature || !verifyWebhookSignature(secret, rawBody, signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const payload = JSON.parse(rawBody);
  const result = await ingestMessage(db, storage, payload);
  return c.json(result);
});

/** Vercel Cron / Dokploy schedule trigger for background jobs (upload cleanup, retention). */
app.post("/cron", async (c) => {
  const { config, db, storage } = c.var;
  const secret = config.env.CRON_SECRET;
  const provided = c.req.header("x-cron-secret");
  if (!secret || provided !== secret) return c.json({ error: "Unauthorized" }, 401);

  const expiredUploads = await cleanupExpiredUploads(db, storage);
  return c.json({ ok: true, expiredUploads });
});

export default app;
