import { api } from "@/lib/api";

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadHandle {
  promise: Promise<{ bucket: string; key: string; etag: string; size: number }>;
  cancel: () => void;
}

/**
 * XFER-01/03: drives the multipart flow entirely from the browser - the
 * server only creates/signs/completes/aborts, so file bytes never pass
 * through the app's own request handler (project-structure.md).
 */
export function uploadFile(
  file: File,
  target: { bucket: string; key: string; onConflict?: "fail" | "overwrite" | "rename" },
  onProgress?: (p: UploadProgress) => void,
): UploadHandle {
  const controller = new AbortController();
  let uploadId: string | undefined;

  const promise = (async () => {
    const session = await api.createUpload({
      bucket: target.bucket,
      key: target.key,
      size: file.size,
      contentType: file.type || undefined,
      onConflict: target.onConflict,
    });
    uploadId = session.uploadId;

    const parts: { partNumber: number; etag: string }[] = [];
    let uploaded = 0;

    for (let partNumber = 1; partNumber <= session.totalParts; partNumber++) {
      const start = (partNumber - 1) * session.partSize;
      const end = Math.min(start + session.partSize, file.size);
      const chunk = file.slice(start, end);

      const { url } = await api.signPart(session.uploadId, partNumber);
      const res = await fetch(url, { method: "PUT", body: chunk, signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to upload part ${partNumber} of "${file.name}"`);

      const etag = (res.headers.get("etag") ?? "").replace(/"/g, "");
      parts.push({ partNumber, etag });
      uploaded += chunk.size;
      onProgress?.({ loaded: uploaded, total: file.size });
    }

    return api.completeUpload(session.uploadId, parts);
  })();

  return {
    promise,
    cancel: () => {
      controller.abort();
      if (uploadId) void api.abortUpload(uploadId).catch(() => {});
    },
  };
}
