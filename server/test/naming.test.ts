import { describe, expect, it, vi } from "vitest";
import { resolveUploadName } from "../src/services/naming";
import type { Storage } from "../src/storage/storage";

function fakeStorage(existingKeys: Set<string>): Storage {
  return {
    head: vi.fn(async (_bucket: string, key: string) =>
      existingKeys.has(key) ? ({ key, size: 0, etag: "x", lastModified: new Date(), customMetadata: {} } as any) : null,
    ),
  } as unknown as Storage;
}

describe("resolveUploadName", () => {
  it("returns the original key when nothing exists there", async () => {
    const storage = fakeStorage(new Set());
    await expect(resolveUploadName(storage, "b", "a/file.txt", "fail")).resolves.toBe("a/file.txt");
  });

  it("throws CONFLICT when onConflict is fail and the key exists", async () => {
    const storage = fakeStorage(new Set(["a/file.txt"]));
    await expect(resolveUploadName(storage, "b", "a/file.txt", "fail")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns the same key when onConflict is overwrite", async () => {
    const storage = fakeStorage(new Set(["a/file.txt"]));
    await expect(resolveUploadName(storage, "b", "a/file.txt", "overwrite")).resolves.toBe("a/file.txt");
  });

  it("finds the next available '(n)' suffix when onConflict is rename", async () => {
    const storage = fakeStorage(new Set(["a/file.txt", "a/file (1).txt"]));
    await expect(resolveUploadName(storage, "b", "a/file.txt", "rename")).resolves.toBe("a/file (2).txt");
  });
});
