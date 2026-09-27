import { and, eq, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Storage } from "../storage/storage";
import { uploadSessions } from "../db/schema";

/** NFR-02/09: aborts multipart uploads left pending past their expiry so R2 doesn't accumulate incomplete parts. */
export async function cleanupExpiredUploads(db: Database, storage: Storage): Promise<number> {
  const stale = await db.query.uploadSessions.findMany({
    where: and(eq(uploadSessions.status, "pending"), lt(uploadSessions.expiresAt, new Date())),
  });

  for (const session of stale) {
    try {
      await storage.abortMultipartUpload(session.bucket, session.key, session.r2UploadId);
    } catch {
      // Already aborted/completed upstream; still mark it expired locally.
    }
    await db.update(uploadSessions).set({ status: "expired" }).where(eq(uploadSessions.id, session.id));
  }

  return stale.length;
}
