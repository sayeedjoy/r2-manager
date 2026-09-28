import { createHmac, randomBytes, randomInt } from "node:crypto";
import { hashToken, timingSafeStringEqual } from "./crypto";

/** RFC 6238 defaults every authenticator app supports: HMAC-SHA1, 6 digits, 30-second steps. */
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the previous and next step too, to tolerate clock drift between the server and the phone. */
const DRIFT_STEPS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32-encoded as authenticator apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/** RFC 4226 HOTP for one counter value. */
export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Returns the step `code` belongs to, or null if it's wrong. Steps at or before `lastUsedStep` are refused so a code
 * seen over someone's shoulder can't be replayed within its 30-second window; the caller must persist the returned step.
 */
export function verifyTotp(secretBase32: string, code: string, lastUsedStep: number | null, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const step = currentStep(now);
  let matched: number | null = null;
  // Check every candidate rather than returning early, so timing doesn't reveal which window matched.
  for (let s = step - DRIFT_STEPS; s <= step + DRIFT_STEPS; s++) {
    if (timingSafeStringEqual(hotp(secret, s), code) && (lastUsedStep === null || s > lastUsedStep)) matched ??= s;
  }
  return matched;
}

export function otpauthUrl(issuer: string, account: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

const RECOVERY_CODE_COUNT = 10;
// No 0/O/1/I/L so codes survive being read aloud or written down.
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Ten one-time codes shaped like "7KQ4M-X9D2P". Show them once; store only recoveryCodeHash() of each. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** Hashes a recovery code so "7kq4m x9d2p" matches "7KQ4M-X9D2P". */
export function recoveryCodeHash(code: string): string {
  return hashToken(code.replace(/[\s-]/g, "").toUpperCase());
}
