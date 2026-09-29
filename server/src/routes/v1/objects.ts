import { Hono } from "hono";
import {
  AppError,
  baseName,
  copyObjectSchema,
  deleteObjectsSchema,
  listObjectsQuerySchema,
  moveObjectSchema,
  renameObjectSchema,
  updateContentSchema,
  zipObjectsSchema,
} from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { assertBucketConfigured } from "../../config";
import { requireCapability } from "../../services/authz";
import {
  listFolder,
  copyObject as copyObjectSvc,
  moveObject as moveObjectSvc,
  renameObject as renameObjectSvc,
  deleteObjects,
} from "../../services/objects";
import { recordAudit } from "../../services/audit";
import { getSettings } from "../../services/settings";
import { buildZipStream } from "../../services/archive";
import {
  applyUntrustedContentHeaders,
  contentDisposition,
} from "../../services/content-disposition";
import { RangeNotSatisfiableError } from "../../storage/storage";

const app = new Hono<HonoEnv>();

app.get("/", async (c) => {
  const query = listObjectsQuerySchema.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, query.bucket);
  await requireCapability(db, user, "object:read", {
    bucket: query.bucket,
    key: query.prefix,
  });

  const result = await listFolder(storage, query);
  return c.json(result);
});

/** XFER-05: streams a single object, honoring HTTP Range for previews/media. */
app.get("/content", async (c) => {
  const bucket = c.req.query("bucket");
  const key = c.req.query("key");
  if (!bucket || !key)
    return c.json({ error: "bucket and key are required" }, 400);

  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, bucket);
  await requireCapability(db, user, "object:read", { bucket, key });

  const rangeHeader = c.req.header("range");
  let range: { start: number; end?: number } | undefined;
  if (rangeHeader) {
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (match)
      range = {
        start: Number(match[1]),
        end: match[2] ? Number(match[2]) : undefined,
      };
  }

  let result;
  try {
    result = await storage.get(bucket, key, { range });
  } catch (error) {
    if (error instanceof RangeNotSatisfiableError) {
      return new Response(null, {
        status: 416,
        headers: {
          "accept-ranges": "bytes",
          "content-range": `bytes */${error.total}`,
        },
      });
    }
    throw error;
  }
  if (!result) return c.json({ error: "Not found" }, 404);

  const headers = new Headers();
  headers.set("content-type", result.contentType ?? "application/octet-stream");
  headers.set("etag", `"${result.etag}"`);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, no-cache");
  headers.set("content-disposition", contentDisposition(baseName(key)));
  applyUntrustedContentHeaders(headers);
  if (result.range) {
    headers.set(
      "content-range",
      `bytes ${result.range.start}-${result.range.end}/${result.range.total}`,
    );
    headers.set(
      "content-length",
      String(result.range.end - result.range.start + 1),
    );
    return new Response(result.body, { status: 206, headers });
  }
  headers.set("content-length", String(result.size));
  return new Response(result.body, { status: 200, headers });
});

app.post("/rename", async (c) => {
  const body = renameObjectSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.bucket);
  await requireCapability(db, user, "object:write", {
    bucket: body.bucket,
    key: body.key,
  });

  const result = await renameObjectSvc(storage, body);
  await recordAudit(db, {
    actorId: user.id,
    action: "object.rename",
    target: `${body.bucket}/${body.key}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { newKey: result.key },
  });
  return c.json(result);
});

app.post("/copy", async (c) => {
  const body = copyObjectSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.sourceBucket);
  assertBucketConfigured(config, body.destBucket);
  await requireCapability(db, user, "object:read", {
    bucket: body.sourceBucket,
    key: body.sourceKey,
  });
  await requireCapability(db, user, "object:write", {
    bucket: body.destBucket,
    key: body.destKey,
  });

  const result = await copyObjectSvc(storage, body);
  await recordAudit(db, {
    actorId: user.id,
    action: "object.copy",
    target: `${body.sourceBucket}/${body.sourceKey}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { destBucket: body.destBucket, destKey: result.key },
  });
  return c.json(result);
});

app.post("/move", async (c) => {
  const body = moveObjectSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.sourceBucket);
  assertBucketConfigured(config, body.destBucket);
  await requireCapability(db, user, "object:write", {
    bucket: body.sourceBucket,
    key: body.sourceKey,
  });
  await requireCapability(db, user, "object:write", {
    bucket: body.destBucket,
    key: body.destKey,
  });

  const result = await moveObjectSvc(storage, body);
  await recordAudit(db, {
    actorId: user.id,
    action: "object.move",
    target: `${body.sourceBucket}/${body.sourceKey}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { destBucket: body.destBucket, destKey: result.key },
  });
  return c.json(result);
});

app.post("/delete", async (c) => {
  const body = deleteObjectsSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.bucket);
  for (const key of body.keys) {
    await requireCapability(db, user, "object:delete", {
      bucket: body.bucket,
      key,
    });
  }

  await deleteObjects(storage, body.bucket, body.keys);
  await recordAudit(db, {
    actorId: user.id,
    action: "object.delete",
    target: body.bucket,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { keys: body.keys },
  });
  return c.json({ deleted: body.keys });
});

/** EDIT-02: saves editor content, guarded by an If-Match ETag so a concurrent change is reported instead of silently overwritten. */
app.put("/content", async (c) => {
  const body = updateContentSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.bucket);
  await requireCapability(db, user, "object:write", {
    bucket: body.bucket,
    key: body.key,
  });

  const settings = await getSettings(db);
  const bytes = new TextEncoder().encode(body.content);
  if (bytes.byteLength > settings.maxEditorSizeBytes) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      `Content exceeds the configured editor limit of ${settings.maxEditorSizeBytes} bytes`,
    );
  }

  const current = await storage.head(body.bucket, body.key);
  if (!current) throw new AppError("NOT_FOUND", "Object not found");
  if (current.etag !== body.ifMatch) {
    throw new AppError(
      "PRECONDITION_FAILED",
      "The file changed since it was loaded; reload and try again",
    );
  }

  const { etag } = await storage.put(body.bucket, body.key, bytes, {
    contentType: body.contentType ?? current.contentType,
    contentDisposition: current.contentDisposition,
    cacheControl: current.cacheControl,
    contentLanguage: current.contentLanguage,
    customMetadata: current.customMetadata,
  });

  await recordAudit(db, {
    actorId: user.id,
    action: "object.edit",
    target: `${body.bucket}/${body.key}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { size: bytes.byteLength },
  });

  return c.json({
    bucket: body.bucket,
    key: body.key,
    etag,
    size: bytes.byteLength,
  });
});

/** XFER-06: bulk download as a generated archive, bounded by the configured size limit. */
app.post("/zip", async (c) => {
  const body = zipObjectsSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.bucket);
  for (const key of body.keys) {
    await requireCapability(db, user, "object:read", {
      bucket: body.bucket,
      key,
    });
  }

  const settings = await getSettings(db);
  const heads = await Promise.all(
    body.keys.map((key) => storage.head(body.bucket, key)),
  );
  const missing = body.keys.filter((_, i) => !heads[i]);
  if (missing.length > 0)
    throw new AppError("NOT_FOUND", `Not found: ${missing.join(", ")}`);

  const totalBytes = heads.reduce((sum, h) => sum + (h?.size ?? 0), 0);
  if (totalBytes > settings.maxBulkDownloadBytes) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      `Selection is ${totalBytes} bytes, over the configured bulk-download limit of ${settings.maxBulkDownloadBytes}. Download files individually instead.`,
    );
  }

  const zipBytes = await buildZipStream(storage, body.bucket, body.keys);

  await recordAudit(db, {
    actorId: user.id,
    action: "object.bulk-download",
    target: body.bucket,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { keys: body.keys, totalBytes },
  });

  return new Response(zipBytes, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": contentDisposition(body.archiveName),
      "content-length": String(zipBytes.byteLength),
    },
  });
});

export default app;
