import { and, eq, isNull, sql } from "drizzle-orm";
import { AppError } from "@r2-manager/shared";
import type { Database } from "../db/client";
import type { Storage } from "../storage/storage";
import { shares, shareTransfers } from "../db/schema";
import { generateToken, hashPassword, hashToken, verifyPassword } from "./crypto";

export interface CreateShareParams {
  bucket: string;
  key: string;
  password?: string;
  expiresAt?: string;
  maxDownloads?: number;
  deliveryMode: "stream" | "redirect";
  inlinePreview: boolean;
  createdBy: string;
}

/** SHARE-01/03: creates a share with a random token; only the token's hash is stored. */
export async function createShare(db: Database, storage: Storage, params: CreateShareParams) {
  const head = await storage.head(params.bucket, params.key);
  if (!head) throw new AppError("NOT_FOUND", "File not found");

  const token = generateToken(32);
  const passwordHash = params.password ? await hashPassword(params.password) : null;

  const [row] = await db
    .insert(shares)
    .values({
      tokenHash: hashToken(token),
      bucket: params.bucket,
      key: params.key,
      passwordHash,
      expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
      maxDownloads: params.maxDownloads ?? null,
      deliveryMode: params.deliveryMode,
      inlinePreview: params.inlinePreview,
      createdBy: params.createdBy,
    })
    .returning();

  if (!row) throw new AppError("INTERNAL_ERROR", "Failed to create share");
  return { row, token };
}

export async function listSharesForObject(db: Database, bucket: string, key: string) {
  return db.query.shares.findMany({ where: and(eq(shares.bucket, bucket), eq(shares.key, key)) });
}

/** SHARE-05: immediate revocation. */
export async function revokeShare(db: Database, shareId: string) {
  await db.update(shares).set({ revokedAt: new Date() }).where(eq(shares.id, shareId));
}

export interface ShareCheck {
  ok: boolean;
  reason?: "not_found" | "revoked" | "expired" | "exhausted" | "password_required" | "invalid_password";
  share?: typeof shares.$inferSelect;
}

/** SHARE-02: revocation, expiry, and password checks before any bytes are streamed. Does not consume a reservation. */
export async function checkShareAccess(db: Database, token: string, password?: string): Promise<ShareCheck> {
  const share = await db.query.shares.findFirst({ where: eq(shares.tokenHash, hashToken(token)) });
  if (!share) return { ok: false, reason: "not_found" };
  if (share.revokedAt) return { ok: false, reason: "revoked" };
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (share.maxDownloads !== null && share.reservedDownloads >= share.maxDownloads) {
    return { ok: false, reason: "exhausted" };
  }
  if (share.passwordHash) {
    if (!password) return { ok: false, reason: "password_required", share };
    if (!(await verifyPassword(password, share.passwordHash))) {
      return { ok: false, reason: "invalid_password", share };
    }
  }
  return { ok: true, share };
}

/**
 * SHARE-04: atomically reserves a download slot before serving bytes.
 * A single conditional UPDATE avoids a race between concurrent requests.
 */
export async function reserveDownload(db: Database, shareId: string): Promise<boolean> {
  const rows = await db
    .update(shares)
    .set({ reservedDownloads: sql`${shares.reservedDownloads} + 1` })
    .where(
      and(
        eq(shares.id, shareId),
        isNull(shares.revokedAt),
        sql`(${shares.maxDownloads} IS NULL OR ${shares.reservedDownloads} < ${shares.maxDownloads})`,
      ),
    )
    .returning();

  if (rows.length === 0) return false;
  await db.insert(shareTransfers).values({ shareId, status: "reserved" });
  return true;
}
