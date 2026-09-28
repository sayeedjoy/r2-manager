import JSZip from "jszip";
import {
  AppError,
  MAX_IN_MEMORY_ZIP_BYTES,
  baseName,
} from "@r2-manager/shared";
import type { Storage } from "../storage/storage";

/**
 * XFER-06: builds a zip archive of the given keys in memory. Bounded by the
 * caller's size check (routes/v1/objects.ts) before this is invoked, so this
 * stays a simple in-memory build rather than a true streaming pipeline -
 * acceptable for the "within configured resource limits" case the SRS calls
 * for; larger selections are rejected upstream and users fall back to
 * individual downloads.
 */
export async function buildZipStream(
  storage: Storage,
  bucket: string,
  keys: string[],
): Promise<Uint8Array> {
  const zip = new JSZip();
  let loadedBytes = 0;

  for (const key of keys) {
    const result = await storage.get(bucket, key);
    if (!result) throw new AppError("NOT_FOUND", `Object not found: ${key}`);
    loadedBytes += result.size;
    if (loadedBytes > MAX_IN_MEMORY_ZIP_BYTES) {
      throw new AppError(
        "PAYLOAD_TOO_LARGE",
        `Archive input exceeds the ${MAX_IN_MEMORY_ZIP_BYTES}-byte in-memory limit`,
      );
    }
    const buffer = await new Response(result.body).arrayBuffer();
    zip.file(baseName(key) || key, buffer);
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
