import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { AppError, normalizeKey } from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { assertBucketConfigured } from "../../config";
import { requireCapability } from "../../services/authz";
import { mailAttachments, mailMessages } from "../../db/schema";
import { recordAudit } from "../../services/audit";

const app = new Hono<HonoEnv>();

/** MAIL-04: inbox listing, most recent first. */
app.get("/messages", async (c) => {
  const { db, user } = c.var;
  await requireCapability(db, user, "mail:read");

  const messages = await db.query.mailMessages.findMany({ orderBy: desc(mailMessages.receivedAt), limit: 100 });
  return c.json({ messages });
});

app.get("/messages/:id", async (c) => {
  const { db, user } = c.var;
  await requireCapability(db, user, "mail:read");

  const id = c.req.param("id");
  const message = await db.query.mailMessages.findFirst({ where: eq(mailMessages.id, id) });
  if (!message) throw new AppError("NOT_FOUND", "Message not found");
  const attachments = await db.query.mailAttachments.findMany({ where: eq(mailAttachments.messageId, id) });
  return c.json({ message, attachments });
});

/** MAIL-04: downloads/previews an attachment, reusing the same safety rules as ordinary file preview. */
app.get("/attachments/:id/content", async (c) => {
  const { db, user, storage, config } = c.var;
  await requireCapability(db, user, "mail:read");

  const id = c.req.param("id");
  const attachment = await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, id) });
  if (!attachment || attachment.status !== "stored") throw new AppError("NOT_FOUND", "Attachment not found");

  const inboxBucket = config.buckets[0]!;
  const result = await storage.get(inboxBucket, attachment.objectKey);
  if (!result) throw new AppError("NOT_FOUND", "Attachment not found");

  return new Response(result.body, {
    headers: {
      "content-type": attachment.mimeType ?? "application/octet-stream",
      "content-disposition": `inline; filename="${attachment.displayFilename}"`,
      "content-length": String(result.size),
    },
  });
});

/** MAIL-04: copies an attachment into an ordinary managed folder the user can browse normally. */
app.post("/attachments/:id/copy-to-folder", async (c) => {
  const { db, user, storage, config } = c.var;
  await requireCapability(db, user, "mail:manage");

  const id = c.req.param("id");
  const body = await c.req.json<{ destBucket: string; destKey: string }>();
  assertBucketConfigured(config, body.destBucket);
  await requireCapability(db, user, "object:write", { bucket: body.destBucket, key: body.destKey });

  const attachment = await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, id) });
  if (!attachment || attachment.status !== "stored") throw new AppError("NOT_FOUND", "Attachment not found");

  const inboxBucket = config.buckets[0]!;
  const destKey = normalizeKey(body.destKey);
  const { etag } = await storage.copy(inboxBucket, attachment.objectKey, body.destBucket, destKey);

  await recordAudit(db, {
    actorId: user.id,
    action: "mail.attachment.copy",
    target: `${body.destBucket}/${destKey}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { attachmentId: id },
  });

  return c.json({ bucket: body.destBucket, key: destKey, etag });
});

export default app;
