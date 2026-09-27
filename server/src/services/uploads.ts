import { eq } from "drizzle-orm";
import { AppError, normalizeKey } from "@r2-manager/shared";
import type { Database } from "../db/client";
import type { Storage } from "../storage/storage";
import { uploadSessions } from "../db/schema";
import { resolveUploadName } from "./naming";

const PART_SIZE = 16 * 1024 * 1024; // 16 MiB: comfortably below Vercel's ~4.5 MB *request body* limit is irrelevant here since parts go straight to R2
const MAX_PARTS = 10_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const PART_URL_TTL_SECONDS = 15 * 60;

export interface CreateUploadParams {
  bucket: string;
  key: string;
  size: number;
  contentType?: string;
  onConflict: "fail" | "overwrite" | "rename";
  ownerId: string;
  maxUploadSizeBytes: number;
}

/** XFER-03/XFER-04: authorizes and initiates a multipart upload, choosing a part size under platform limits. */
export async function createUpload(db: Database, storage: Storage, params: CreateUploadParams) {
  if (params.size > params.maxUploadSizeBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", `File exceeds the configured limit of ${params.maxUploadSizeBytes} bytes`);
  }
  const totalParts = Math.ceil(params.size / PART_SIZE);
  if (totalParts > MAX_PARTS) {
    throw new AppError("VALIDATION_ERROR", "File is too large for the configured part size");
  }

  const key = await resolveUploadName(storage, params.bucket, normalizeKey(params.key), params.onConflict);
  const handle = await storage.createMultipartUpload(params.bucket, key, { contentType: params.contentType });

  const [session] = await db
    .insert(uploadSessions)
    .values({
      ownerId: params.ownerId,
      bucket: params.bucket,
      key,
      r2UploadId: handle.uploadId,
      size: params.size,
      partSize: PART_SIZE,
      totalParts,
      status: "pending",
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    .returning();
  if (!session) throw new AppError("INTERNAL_ERROR", "Failed to create upload session");

  return {
    uploadId: session.id,
    bucket: params.bucket,
    key,
    partSize: PART_SIZE,
    totalParts,
  };
}

async function loadSession(db: Database, uploadId: string, ownerId: string) {
  const session = await db.query.uploadSessions.findFirst({ where: eq(uploadSessions.id, uploadId) });
  if (!session || session.ownerId !== ownerId) {
    throw new AppError("NOT_FOUND", "Upload session not found");
  }
  if (session.status !== "pending") {
    throw new AppError("CONFLICT", `Upload session is ${session.status}`);
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new AppError("CONFLICT", "Upload session has expired");
  }
  return session;
}

export async function signPart(db: Database, storage: Storage, ownerId: string, uploadId: string, partNumber: number) {
  const session = await loadSession(db, uploadId, ownerId);
  if (partNumber < 1 || partNumber > session.totalParts) {
    throw new AppError("VALIDATION_ERROR", "Part number out of range for this upload");
  }
  const url = await storage.signUploadPart(session.bucket, session.key, session.r2UploadId, partNumber, PART_URL_TTL_SECONDS);
  return { url, partNumber, expiresAt: new Date(Date.now() + PART_URL_TTL_SECONDS * 1000).toISOString() };
}

export async function completeUpload(
  db: Database,
  storage: Storage,
  ownerId: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  const session = await loadSession(db, uploadId, ownerId);
  if (parts.length !== session.totalParts) {
    throw new AppError("VALIDATION_ERROR", `Expected ${session.totalParts} parts, received ${parts.length}`);
  }

  const { etag } = await storage.completeMultipartUpload(session.bucket, session.key, session.r2UploadId, parts);

  const head = await storage.head(session.bucket, session.key);
  if (!head || head.size !== session.size) {
    throw new AppError("UPSTREAM_ERROR", "Uploaded object size does not match the declared size");
  }

  await db.update(uploadSessions).set({ status: "completed" }).where(eq(uploadSessions.id, uploadId));
  return { bucket: session.bucket, key: session.key, etag, size: head.size };
}

export async function abortUpload(db: Database, storage: Storage, ownerId: string, uploadId: string) {
  const session = await loadSession(db, uploadId, ownerId);
  await storage.abortMultipartUpload(session.bucket, session.key, session.r2UploadId);
  await db.update(uploadSessions).set({ status: "aborted" }).where(eq(uploadSessions.id, uploadId));
}
