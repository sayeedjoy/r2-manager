import { createHmac, timingSafeEqual } from "node:crypto";
import PostalMime from "postal-mime";
import { eq } from "drizzle-orm";
import { normalizeKey } from "@r2-manager/shared";
import type { Database } from "../db/client";
import type { Storage } from "../storage/storage";
import { mailMessages, mailAttachments } from "../db/schema";
import { checkMessageAllowed, isAttachmentAllowed, DEFAULT_MAIL_RULES, type MailRules } from "./rules";

export interface MailWebhookPayload {
  rawObjectKey: string; // where the relay Worker stored the raw message in R2
  bucket: string;
  sender: string;
  recipient: string;
  sizeBytes: number;
}

/** Verifies the relay Worker's signed webhook (HMAC-SHA256 over the raw request body). */
export function verifyWebhookSignature(secret: string, body: string, signatureHex: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(signatureHex, "hex");
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}

/** MAIL-02/03: fetches the raw message, parses MIME safely, stores allowed attachments under generated keys. */
export async function ingestMessage(
  db: Database,
  storage: Storage,
  payload: MailWebhookPayload,
  rules: MailRules = DEFAULT_MAIL_RULES,
): Promise<{ status: "processed" | "rejected"; reason?: string; messageId: string }> {
  const rejection = checkMessageAllowed(rules, {
    sender: payload.sender,
    recipient: payload.recipient,
    sizeBytes: payload.sizeBytes,
  });

  if (rejection) {
    const [row] = await db
      .insert(mailMessages)
      .values({
        sender: payload.sender,
        recipient: payload.recipient,
        rawObjectKey: payload.rawObjectKey,
        status: "rejected",
        reason: rejection,
      })
      .returning();
    return { status: "rejected", reason: rejection, messageId: row!.id };
  }

  const raw = await storage.get(payload.bucket, payload.rawObjectKey);
  if (!raw) {
    const [row] = await db
      .insert(mailMessages)
      .values({ sender: payload.sender, recipient: payload.recipient, status: "failed", reason: "raw_object_missing" })
      .returning();
    return { status: "rejected", reason: "raw_object_missing", messageId: row!.id };
  }

  const rawBuffer = Buffer.from(await new Response(raw.body).arrayBuffer());
  const parsed = await PostalMime.parse(rawBuffer);

  // Dedupe by Message-ID where the sender supplied one (NFR-09, MAIL-05).
  if (parsed.messageId) {
    const existing = await db.query.mailMessages.findFirst({
      where: eq(mailMessages.externalMessageId, parsed.messageId),
    });
    if (existing) {
      return { status: "processed", messageId: existing.id };
    }
  }

  const [message] = await db
    .insert(mailMessages)
    .values({
      externalMessageId: parsed.messageId ?? null,
      sender: payload.sender,
      recipient: payload.recipient,
      subject: parsed.subject ?? null,
      rawObjectKey: payload.rawObjectKey,
      status: "processed",
    })
    .returning();

  for (const attachment of parsed.attachments ?? []) {
    const content = attachment.content instanceof ArrayBuffer ? Buffer.from(attachment.content) : Buffer.from(attachment.content as any);
    const allowed = isAttachmentAllowed(rules, attachment.mimeType, content.byteLength);
    const safeName = (attachment.filename ?? "attachment").replace(/[/\\]/g, "_");
    const objectKey = normalizeKey(`_inbox/attachments/${message!.id}/${crypto.randomUUID()}-${safeName}`);

    if (!allowed) {
      await db.insert(mailAttachments).values({
        messageId: message!.id,
        objectKey,
        displayFilename: safeName,
        mimeType: attachment.mimeType,
        size: content.byteLength,
        status: "rejected",
      });
      continue;
    }

    await storage.put(payload.bucket, objectKey, content, { contentType: attachment.mimeType });
    await db.insert(mailAttachments).values({
      messageId: message!.id,
      objectKey,
      displayFilename: safeName,
      mimeType: attachment.mimeType,
      size: content.byteLength,
      status: "stored",
    });
  }

  return { status: "processed", messageId: message!.id };
}
