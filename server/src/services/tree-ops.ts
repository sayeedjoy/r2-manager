import type { Storage } from "../storage/storage";
import { copyObject, moveObject } from "./objects";
import type { TreeOperationRequest, TreeOperationResponse } from "@r2-manager/shared";

/**
 * FILE-05 / project-structure.md: folder operations run in cursor-based
 * batches so a single call stays within a serverless function's time limit
 * and progress/cancellation is visible to the client. Not atomic across the
 * whole tree - each item's result is reported individually (NFR-09).
 */
export async function runTreeBatch(storage: Storage, req: TreeOperationRequest): Promise<TreeOperationResponse> {
  const listing = await storage.list(req.sourceBucket, req.sourcePrefix, {
    cursor: req.cursor,
    limit: req.batchSize,
  });

  const processed: TreeOperationResponse["processed"] = [];

  for (const obj of listing.objects) {
    try {
      if (req.op === "delete") {
        await storage.delete(req.sourceBucket, obj.key);
      } else {
        if (!req.destBucket || req.destPrefix === undefined) {
          throw new Error("destBucket and destPrefix are required for copy/move");
        }
        const relative = obj.key.slice(req.sourcePrefix.length);
        const destKey = `${req.destPrefix}${relative}`;
        const fn = req.op === "copy" ? copyObject : moveObject;
        await fn(storage, {
          sourceBucket: req.sourceBucket,
          sourceKey: obj.key,
          destBucket: req.destBucket,
          destKey,
          onConflict: req.onConflict,
        });
      }
      processed.push({ key: obj.key, status: "ok" });
    } catch (err) {
      processed.push({ key: obj.key, status: "failed", reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return {
    cursor: listing.cursor,
    done: !listing.truncated,
    processed,
  };
}
