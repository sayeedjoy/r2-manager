import { eq } from "drizzle-orm";
import { MAX_IN_MEMORY_ZIP_BYTES, type AppSettings } from "@r2-manager/shared";
import type { Database } from "../db/client";
import { appSettings } from "../db/schema";

const SETTINGS_KEY = "app";

export const DEFAULT_SETTINGS: AppSettings = {
  maxUploadSizeBytes: 5 * 1024 * 1024 * 1024, // 5 GiB
  allowedUploadTypes: null, // null = no restriction
  maxPreviewSizeBytes: 25 * 1024 * 1024,
  maxEditorSizeBytes: 2 * 1024 * 1024,
  maxBulkDownloadBytes: MAX_IN_MEMORY_ZIP_BYTES,
  defaultShareExpiryHours: 24 * 7,
  defaultShareMaxDownloads: null,
};

/** ADMIN-02: administrator-configurable limits, stored in Postgres with sane defaults. */
export async function getSettings(db: Database): Promise<AppSettings> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, SETTINGS_KEY),
  });
  if (!row) return DEFAULT_SETTINGS;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(row.value as Partial<AppSettings>),
  };
  return {
    ...merged,
    maxBulkDownloadBytes: Math.min(
      merged.maxBulkDownloadBytes,
      MAX_IN_MEMORY_ZIP_BYTES,
    ),
  };
}

export async function updateSettings(
  db: Database,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getSettings(db);
  const next = { ...current, ...patch };
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedAt: new Date() },
    });
  return next;
}
