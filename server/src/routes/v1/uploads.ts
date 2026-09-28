import { Hono } from "hono";
import {
  AppError,
  abortUploadSchema,
  completeUploadSchema,
  createUploadSchema,
  signPartSchema,
} from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { assertBucketConfigured } from "../../config";
import { requireCapability } from "../../services/authz";
import {
  createUpload,
  signPart,
  completeUpload,
  abortUpload,
} from "../../services/uploads";
import { recordAudit } from "../../services/audit";
import { getSettings } from "../../services/settings";

const app = new Hono<HonoEnv>();

app.post("/", async (c) => {
  const body = createUploadSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.bucket);
  await requireCapability(db, user, "object:write", {
    bucket: body.bucket,
    key: body.key,
  });

  const settings = await getSettings(db);
  const normalizedContentType = body.contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const allowedTypes = settings.allowedUploadTypes?.map((type) =>
    type.trim().toLowerCase(),
  );
  if (
    allowedTypes &&
    (!normalizedContentType || !allowedTypes.includes(normalizedContentType))
  ) {
    throw new AppError("UNSUPPORTED_TYPE", "This file type is not allowed");
  }
  const result = await createUpload(db, storage, {
    ...body,
    contentType: normalizedContentType,
    ownerId: user.id,
    maxUploadSizeBytes: settings.maxUploadSizeBytes,
  });
  return c.json(result);
});

app.post("/sign-part", async (c) => {
  const body = signPartSchema.parse(await c.req.json());
  const { db, user, storage } = c.var;
  const result = await signPart(
    db,
    storage,
    user.id,
    body.uploadId,
    body.partNumber,
  );
  return c.json(result);
});

app.post("/complete", async (c) => {
  const body = completeUploadSchema.parse(await c.req.json());
  const { db, user, storage } = c.var;
  const result = await completeUpload(
    db,
    storage,
    user.id,
    body.uploadId,
    body.parts,
  );
  await recordAudit(db, {
    actorId: user.id,
    action: "upload.complete",
    target: `${result.bucket}/${result.key}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { size: result.size },
  });
  return c.json(result);
});

app.post("/abort", async (c) => {
  const body = abortUploadSchema.parse(await c.req.json());
  const { db, user, storage } = c.var;
  await abortUpload(db, storage, user.id, body.uploadId);
  await recordAudit(db, {
    actorId: user.id,
    action: "upload.abort",
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { uploadId: body.uploadId },
  });
  return c.json({ ok: true });
});

export default app;
