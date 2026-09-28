import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from "../src/services/crypto";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("encryptSecret", () => {
  it("round-trips and never stores the plaintext", () => {
    const stored = encryptSecret("JBSWY3DPEHPK3PXP", SECRET);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(stored, SECRET)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same", SECRET)).not.toBe(encryptSecret("same", SECRET));
  });

  it("refuses tampered ciphertext and a different SESSION_SECRET", () => {
    const stored = encryptSecret("smtp-password", SECRET);
    const [v, iv, ct, tag] = stored.split(":");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0]! ^= 1;
    expect(() => decryptSecret([v, iv, flipped.toString("base64url"), tag].join(":"), SECRET)).toThrow();
    expect(() => decryptSecret(stored, "another-secret-another-secret-00")).toThrow();
  });
});

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});
