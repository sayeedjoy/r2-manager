import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  currentStep,
  generateRecoveryCodes,
  hotp,
  otpauthUrl,
  recoveryCodeHash,
  verifyTotp,
} from "../src/services/totp";

// RFC 6238 appendix B uses this ASCII seed for its SHA-1 test vectors.
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC's SHA-1 test vectors", () => {
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ];
    for (const [seconds, expected] of vectors) {
      expect(hotp(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
    }
  });

  it("round-trips base32", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb-oi").toString()).toBe("foobar");
    expect(base32Decode(RFC_SECRET_B32).equals(RFC_SECRET)).toBe(true);
  });

  it("accepts the current code and one step of drift either way", () => {
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    for (const s of [step - 1, step, step + 1]) {
      expect(verifyTotp(RFC_SECRET_B32, hotp(RFC_SECRET, s), null, now)).toBe(s);
    }
    expect(verifyTotp(RFC_SECRET_B32, hotp(RFC_SECRET, step - 2), null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, hotp(RFC_SECRET, step + 2), null, now)).toBeNull();
  });

  it("refuses a code from a step that was already used (replay)", () => {
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET_B32, code, step, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, code, step - 1, now)).toBe(step);
  });

  it("rejects malformed input without throwing", () => {
    expect(verifyTotp(RFC_SECRET_B32, "12345", null)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, "abcdef", null)).toBeNull();
  });

  it("builds an otpauth URL authenticator apps can scan", () => {
    const url = new URL(otpauthUrl("R2 Manager", "a@b.co", "ABC"));
    expect(url.protocol).toBe("otpauth:");
    expect(url.host).toBe("totp");
    expect(decodeURIComponent(url.pathname)).toBe("/R2 Manager:a@b.co");
    expect(url.searchParams.get("secret")).toBe("ABC");
    expect(url.searchParams.get("issuer")).toBe("R2 Manager");
  });
});

describe("recovery codes", () => {
  it("generates ten distinct, readable codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
  });

  it("hashes codes ignoring case, spaces and dashes", () => {
    expect(recoveryCodeHash("7kq4m x9d2p")).toBe(recoveryCodeHash("7KQ4M-X9D2P"));
    expect(recoveryCodeHash("7KQ4M-X9D2P")).not.toBe(recoveryCodeHash("7KQ4M-X9D2Q"));
  });
});
