import { AppError } from "@r2-manager/shared";
import { joinKey, normalizeFolderKey, normalizeKey, parentPrefix } from "@r2-manager/shared";
import type { Storage } from "../storage/storage";
import type { ObjectEntry } from "@r2-manager/shared";
import { resolveUploadName } from "./naming";

export interface ListParams {
  bucket: string;
  prefix: string;
  cursor?: string;
  limit: number;
}

/** FILE-01: paginated listing, folders inferred from common prefixes ("/" delimiter). */
export async function listFolder(storage: Storage, params: ListParams) {
  const result = await storage.list(params.bucket, params.prefix, {
    cursor: params.cursor,
    limit: params.limit,
    delimiter: "/",
  });

  const entries: ObjectEntry[] = [
    ...result.commonPrefixes.map((p) => ({ key: p, type: "folder" as const })),
    ...result.objects
      .filter((o) => o.key !== params.prefix) // exclude the trailing-slash placeholder for the current folder itself
      .map((o) => ({
        key: o.key,
        type: (o.key.endsWith("/") ? "folder" : "file") as "file" | "folder",
        size: o.key.endsWith("/") ? undefined : o.size,
        lastModified: o.lastModified.toISOString(),
        etag: o.etag,
      })),
  ];

  return {
    bucket: params.bucket,
    prefix: params.prefix,
    entries,
    cursor: result.cursor,
    truncated: result.truncated,
  };
}

/** FILE-03: creates an empty folder placeholder object. */
export async function createFolder(storage: Storage, bucket: string, key: string) {
  const folderKey = normalizeFolderKey(key);
  const existing = await storage.head(bucket, folderKey);
  if (existing) {
    throw new AppError("CONFLICT", "A folder already exists at this location");
  }
  await storage.put(bucket, folderKey, new Uint8Array());
  return { key: folderKey };
}

/** FILE-04: copy with source verification, matching the destination's ETag (NFR-09). */
export async function copyObject(
  storage: Storage,
  params: { sourceBucket: string; sourceKey: string; destBucket: string; destKey: string; onConflict: "fail" | "overwrite" | "rename" },
) {
  const source = await storage.head(params.sourceBucket, params.sourceKey);
  if (!source) throw new AppError("NOT_FOUND", "Source object not found");

  const destKey = await resolveUploadName(storage, params.destBucket, normalizeKey(params.destKey), params.onConflict);
  const { etag } = await storage.copy(params.sourceBucket, params.sourceKey, params.destBucket, destKey);

  const verify = await storage.head(params.destBucket, destKey);
  if (!verify || verify.size !== source.size) {
    throw new AppError("UPSTREAM_ERROR", "Copy verification failed: destination size mismatch");
  }

  return { key: destKey, etag };
}

/** FILE-04/FILE-05: copy-then-delete, verifying the copy before removing the source (NFR-09). */
export async function moveObject(
  storage: Storage,
  params: { sourceBucket: string; sourceKey: string; destBucket: string; destKey: string; onConflict: "fail" | "overwrite" | "rename" },
) {
  const result = await copyObject(storage, params);
  await storage.delete(params.sourceBucket, params.sourceKey);
  return result;
}

export async function renameObject(
  storage: Storage,
  params: { bucket: string; key: string; newName: string; onConflict: "fail" | "overwrite" | "rename" },
) {
  const destKey = joinKey(parentPrefix(params.key), params.newName);
  return moveObject(storage, {
    sourceBucket: params.bucket,
    sourceKey: params.key,
    destBucket: params.bucket,
    destKey,
    onConflict: params.onConflict,
  });
}

export async function deleteObjects(storage: Storage, bucket: string, keys: string[]) {
  await storage.deleteMany(bucket, keys);
}
