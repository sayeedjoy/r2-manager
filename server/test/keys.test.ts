import { describe, expect, it } from "vitest";
import { InvalidKeyError, isWithinPrefix, joinKey, normalizeKey, parentPrefix } from "@r2-manager/shared";

describe("normalizeKey", () => {
  it("accepts an ordinary nested key", () => {
    expect(normalizeKey("folder/sub/file.txt")).toBe("folder/sub/file.txt");
  });

  it("rejects path traversal", () => {
    expect(() => normalizeKey("../secret")).toThrow(InvalidKeyError);
    expect(() => normalizeKey("folder/../secret")).toThrow(InvalidKeyError);
  });

  it("rejects a leading slash and empty segments", () => {
    expect(() => normalizeKey("/etc/passwd")).toThrow(InvalidKeyError);
    expect(() => normalizeKey("a//b")).toThrow(InvalidKeyError);
  });

  it("rejects backslashes (Windows-style traversal)", () => {
    expect(() => normalizeKey("a\\..\\b")).toThrow(InvalidKeyError);
  });
});

describe("isWithinPrefix", () => {
  it("treats the empty prefix as covering everything", () => {
    expect(isWithinPrefix("anything/here.txt", "")).toBe(true);
  });

  it("only allows keys under the granted prefix", () => {
    expect(isWithinPrefix("team-a/report.pdf", "team-a/")).toBe(true);
    expect(isWithinPrefix("team-b/report.pdf", "team-a/")).toBe(false);
  });
});

describe("joinKey / parentPrefix", () => {
  it("round-trips a name under a prefix", () => {
    const key = joinKey("a/b/", "c.txt");
    expect(key).toBe("a/b/c.txt");
    expect(parentPrefix(key)).toBe("a/b/");
  });
});
