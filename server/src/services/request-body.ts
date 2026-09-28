import { AppError } from "@r2-manager/shared";

/** Reads a small request envelope without allowing an untrusted client to buffer an arbitrary body. */
export async function readTextBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      `Request body exceeds the ${maxBytes}-byte limit`,
    );
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError(
        "PAYLOAD_TOO_LARGE",
        `Request body exceeds the ${maxBytes}-byte limit`,
      );
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid UTF-8");
  }
}
