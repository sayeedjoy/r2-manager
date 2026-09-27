import { Hono } from "hono";
import { AppError } from "@r2-manager/shared";
import { updateMetadataSchema } from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { assertBucketConfigured } from "../../config";
import { requireCapability } from "../../services/authz";
import { recordAudit } from "../../services/audit";

const app = new Hono<HonoEnv>();

/** META-01: HTTP + custom metadata for one object. */
app.get("/", async (c) => {
  const bucket = c.req.query("bucket");
  const key = c.req.query("key");
  if (!bucket || !key) return c.json({ error: "bucket and key are required" }, 400);

  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, bucket);
  await requireCapability(db, user, "object:read", { bucket, key });

  const head = await storage.head(bucket, key);
  if (!head) throw new AppError("NOT_FOUND", "Object not found");

  return c.json({
    bucket,
    key,
    size: head.size,
    etag: head.etag,
    lastModified: head.lastModified.toISOString(),
    contentType: head.contentType,
    contentDisposition: head.contentDisposition,
    cacheControl: head.cacheControl,
    contentLanguage: head.contentLanguage,
    customMetadata: head.customMetadata,
  });
});

/** META-02: editing HTTP/custom metadata requires an If-Match ETag to avoid clobbering a concurrent change. */
app.put("/", async (c) => {
  const body = updateMetadataSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.bucket);
  await requireCapability(db, user, "object:write", { bucket: body.bucket, key: body.key });

  const current = await storage.head(body.bucket, body.key);
  if (!current) throw new AppError("NOT_FOUND", "Object not found");
  if (current.etag !== body.ifMatch) {
    throw new AppError("PRECONDITION_FAILED", "The object changed since it was loaded; reload and try again");
  }

  // R2/S3 metadata is only settable on write, so preserve content by copying the object onto itself with new headers.
  const getResult = await storage.get(body.bucket, body.key);
  if (!getResult) throw new AppError("NOT_FOUND", "Object not found");

  const { etag } = await storage.put(body.bucket, body.key, getResult.body, {
    contentType: body.contentType ?? current.contentType,
    contentDisposition: body.contentDisposition ?? current.contentDisposition,
    cacheControl: body.cacheControl ?? current.cacheControl,
    contentLanguage: body.contentLanguage ?? current.contentLanguage,
    customMetadata: body.customMetadata ?? current.customMetadata,
  });

  await recordAudit(db, {
    actorId: user.id,
    action: "metadata.update",
    target: `${body.bucket}/${body.key}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });

  return c.json({ bucket: body.bucket, key: body.key, etag });
});

export default app;
