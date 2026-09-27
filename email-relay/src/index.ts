export interface Env {
  INBOX_BUCKET: R2Bucket;
  INBOX_BUCKET_NAME: string; // must match one of the app's configured R2_BUCKETS
  APP_WEBHOOK_URL: string;
  RAW_MESSAGE_PREFIX: string;
  MAIL_WEBHOOK_SECRET: string; // set via `wrangler secret put MAIL_WEBHOOK_SECRET`
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * MAIL-01/02: the only Cloudflare-hosted piece (project-structure.md). Saves
 * the raw message to R2, then POSTs a signed webhook so the main app - which
 * runs on Dokploy/Vercel - can parse and index it (server/src/mail/ingest.ts).
 */
export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const rawObjectKey = `${env.RAW_MESSAGE_PREFIX}${crypto.randomUUID()}.eml`;

    const rawStream = message.raw;
    await env.INBOX_BUCKET.put(rawObjectKey, rawStream, {
      httpMetadata: { contentType: "message/rfc822" },
    });

    const payload = JSON.stringify({
      rawObjectKey,
      bucket: env.INBOX_BUCKET_NAME,
      sender: message.from,
      recipient: message.to,
      sizeBytes: message.rawSize,
    });

    const signature = await hmacHex(env.MAIL_WEBHOOK_SECRET, payload);

    const res = await fetch(env.APP_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-signature": signature },
      body: payload,
    });

    if (!res.ok) {
      // MAIL-06: surface a retryable failure to Email Routing rather than silently dropping the message.
      message.setReject(`Webhook delivery failed with status ${res.status}`);
    }
  },
} satisfies ExportedHandler<Env>;
