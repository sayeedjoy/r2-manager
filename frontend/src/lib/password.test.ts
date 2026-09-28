import { describe, expect, it } from "vitest";
import { validateNewPassword } from "./password";
import { safeNextPath } from "./sign-out";

describe("validateNewPassword", () => {
  it("accepts a long enough password that matches its confirmation", () => {
    expect(validateNewPassword("correct horse", "correct horse")).toEqual({});
  });

  it("flags short passwords and mismatched confirmations separately", () => {
    expect(validateNewPassword("short", "short").password).toMatch(/at least 10/);
    expect(validateNewPassword("correct horse", "correct hors").confirm).toMatch(/don't match/);
  });
});

describe("safeNextPath", () => {
  it("keeps paths inside the app", () => {
    expect(safeNextPath("/b/bucket/folder?x=1")).toBe("/b/bucket/folder?x=1");
  });

  it("refuses anything that could leave the app (open redirect)", () => {
    for (const next of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      expect(safeNextPath(next)).toBe("/");
    }
  });
});
