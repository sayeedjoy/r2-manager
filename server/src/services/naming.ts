import { AppError, baseName, joinKey, parentPrefix } from "@r2-manager/shared";
import type { Storage } from "../storage/storage";

/** Shared collision policy for uploads and object copy/move/rename (FILE-04, XFER-01). */
export async function resolveUploadName(
  storage: Storage,
  bucket: string,
  key: string,
  onConflict: "fail" | "overwrite" | "rename",
): Promise<string> {
  const existing = await storage.head(bucket, key);
  if (!existing) return key;
  if (onConflict === "fail") {
    throw new AppError("CONFLICT", `An object already exists at ${key}`);
  }
  if (onConflict === "overwrite") return key;

  const prefix = parentPrefix(key);
  const name = baseName(key);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const candidate = joinKey(prefix, `${stem} (${i})${ext}`);
    if (!(await storage.head(bucket, candidate))) return candidate;
  }
  throw new AppError("CONFLICT", "Could not find an available name");
}
