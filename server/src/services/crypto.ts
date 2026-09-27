import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/** Hashes a password for storage. Format: scrypt:<saltHex>:<hashHex>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Verifies a password against a hash produced by hashPassword(). Constant-time compare. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts as [string, string, string];
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Generates a URL-safe random token (e.g. for share links). Returns the raw token; store only its hash. */
export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/** Deterministic, non-reversible hash for storing tokens (share tokens are looked up by hash, not compared one by one). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
