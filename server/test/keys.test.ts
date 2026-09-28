import { describe, expect, it } from "vitest";
import {
  InvalidKeyError,
  isWithinPrefix,
  joinKey,
  normalizeFolderKey,
  normalizeKey,
  parentPrefix,
} from "@r2-manager/shared";

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

  it("treats a prefix without a trailing slash as a folder boundary", () => {
    expect(isWithinPrefix("team-a/report.pdf", "team-a")).toBe(true);
    expect(isWithinPrefix("team-admin/report.pdf", "team-a")).toBe(false);
    expect(isWithinPrefix("team-a", "team-a")).toBe(false);
  });
});

describe("joinKey / parentPrefix", () => {
  it("round-trips a name under a prefix", () => {
    const key = joinKey("a/b/", "c.txt");
    expect(key).toBe("a/b/c.txt");
    expect(parentPrefix(key)).toBe("a/b/");
  });
});

describe("normalizeFolderKey", () => {
  it("adds exactly one trailing slash", () => {
    expect(normalizeFolderKey("reports")).toBe("reports/");
    expect(normalizeFolderKey("team-a/reports")).toBe("team-a/reports/");
  });

  it("accepts a key that already ends in a slash", () => {
    expect(normalizeFolderKey("team-a/reports/")).toBe("team-a/reports/");
    expect(normalizeFolderKey(" reports/ ")).toBe("reports/");
  });

  it("still rejects unsafe folder keys", () => {
    expect(() => normalizeFolderKey("")).toThrow(InvalidKeyError);
    expect(() => normalizeFolderKey("/")).toThrow(InvalidKeyError);
    expect(() => normalizeFolderKey("a//")).toThrow(InvalidKeyError);
    expect(() => normalizeFolderKey("../secret/")).toThrow(InvalidKeyError);
  });
});
