import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
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

/**
 * Encrypts small secrets stored in Postgres (TOTP secrets, the SMTP password) with AES-256-GCM.
 * The key is derived from SESSION_SECRET with HKDF, so it never sits in the database next to the ciphertext.
 * Format: v1:<iv>:<ciphertext>:<tag>, each base64url.
 */
export function encryptSecret(plaintext: string, sessionSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretBoxKey(sessionSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, ciphertext, tag].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(":");
}

/** Reverses encryptSecret(). Throws if the value was tampered with or SESSION_SECRET changed. */
export function decryptSecret(stored: string, sessionSecret: string): string {
  const [version, ivPart, ctPart, tagPart] = stored.split(":");
  if (version !== "v1" || !ivPart || ctPart === undefined || !tagPart) throw new Error("Unrecognized secret format");
  const decipher = createDecipheriv("aes-256-gcm", secretBoxKey(sessionSecret), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctPart, "base64url")), decipher.final()]).toString("utf8");
}

const secretBoxKeys = new Map<string, Buffer>();

function secretBoxKey(sessionSecret: string): Buffer {
  let key = secretBoxKeys.get(sessionSecret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", sessionSecret, "r2-manager", "secret-box v1", 32));
    secretBoxKeys.set(sessionSecret, key);
  }
  return key;
}
