import { Hono } from "hono";
import { createFolderSchema, treeOperationSchema } from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { assertBucketConfigured } from "../../config";
import { requireCapability } from "../../services/authz";
import { createFolder } from "../../services/objects";
import { runTreeBatch } from "../../services/tree-ops";
import { recordAudit } from "../../services/audit";

const app = new Hono<HonoEnv>();

app.post("/", async (c) => {
  const body = createFolderSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.bucket);
  await requireCapability(db, user, "object:write", { bucket: body.bucket, key: body.key });

  const result = await createFolder(storage, body.bucket, body.key);
  await recordAudit(db, {
    actorId: user.id,
    action: "folder.create",
    target: `${body.bucket}/${result.key}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json(result);
});

/** FILE-05: one cursor-batch of a folder-tree copy/move/delete. Call repeatedly with the returned cursor until done. */
app.post("/tree-op", async (c) => {
  const body = treeOperationSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.sourceBucket);
  const capability = body.op === "delete" ? "object:delete" : "object:write";
  await requireCapability(db, user, "object:read", { bucket: body.sourceBucket, key: body.sourcePrefix });
  await requireCapability(db, user, capability, { bucket: body.sourceBucket, key: body.sourcePrefix });
  if (body.destBucket) {
    assertBucketConfigured(config, body.destBucket);
    await requireCapability(db, user, "object:write", { bucket: body.destBucket, key: body.destPrefix ?? "" });
  }

  const result = await runTreeBatch(storage, body);
  await recordAudit(db, {
    actorId: user.id,
    action: `folder.tree-op.${body.op}`,
    target: `${body.sourceBucket}/${body.sourcePrefix}`,
    outcome: result.processed.some((p) => p.status === "failed") ? "failure" : "success",
    correlationId: c.get("correlationId"),
    details: { processedCount: result.processed.length, done: result.done },
  });
  return c.json(result);
});

export default app;
