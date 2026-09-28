/**
 * R2 object keys are opaque strings, but this app treats them as POSIX-style
 * paths ("folder/sub/file.txt"). These helpers are the single place that
 * decides what a valid, safe key looks like - both client and server must
 * use them so validation never diverges (SRS FILE-*, XFER-02).
 */

const TRAVERSAL_SEGMENTS = new Set([".", ".."]);

export class InvalidKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKeyError";
  }
}

/** Splits a key into non-empty segments, rejecting traversal and empty segments. */
export function splitKey(key: string): string[] {
  if (key.startsWith("/")) {
    throw new InvalidKeyError("Key must not start with a slash");
  }
  const segments = key.split("/");
  for (const segment of segments) {
    if (segment.length === 0) {
      throw new InvalidKeyError(
        "Key must not contain empty segments (e.g. //)",
      );
    }
    if (TRAVERSAL_SEGMENTS.has(segment)) {
      throw new InvalidKeyError("Key must not contain '.' or '..' segments");
    }
    if (segment.includes("\\")) {
      throw new InvalidKeyError("Key must not contain backslashes");
    }
    if (/[\x00-\x1f]/.test(segment)) {
      throw new InvalidKeyError("Key must not contain control characters");
    }
  }
  return segments;
}

/** Normalizes and validates an object key. Throws InvalidKeyError on unsafe input. */
export function normalizeKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new InvalidKeyError("Key must not be empty");
  }
  if (trimmed.length > 1024) {
    throw new InvalidKeyError("Key must be 1024 characters or fewer");
  }
  const segments = splitKey(trimmed);
  return segments.join("/");
}

/** A "folder" key: normalized and guaranteed to end with a trailing slash. */
export function normalizeFolderKey(key: string): string {
  // Validate without the trailing slash: splitKey treats "a/" as ["a", ""] and rejects the empty last segment.
  const trimmed = key.trim();
  return `${normalizeKey(trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed)}/`;
}

export function isFolderKey(key: string): boolean {
  return key.endsWith("/");
}

export function parentPrefix(key: string): string {
  const withoutTrailingSlash = key.endsWith("/") ? key.slice(0, -1) : key;
  const idx = withoutTrailingSlash.lastIndexOf("/");
  return idx === -1 ? "" : withoutTrailingSlash.slice(0, idx + 1);
}

export function baseName(key: string): string {
  const withoutTrailingSlash = key.endsWith("/") ? key.slice(0, -1) : key;
  const idx = withoutTrailingSlash.lastIndexOf("/");
  return idx === -1
    ? withoutTrailingSlash
    : withoutTrailingSlash.slice(idx + 1);
}

/** True if `key` is inside the folder boundary represented by `prefix`. */
export function isWithinPrefix(key: string, prefix: string): boolean {
  if (prefix === "") return true;
  const folderPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return key.startsWith(folderPrefix);
}

export function joinKey(prefix: string, name: string): string {
  const cleanPrefix =
    prefix === "" ? "" : prefix.endsWith("/") ? prefix : `${prefix}/`;
  return normalizeKey(`${cleanPrefix}${name}`);
}
