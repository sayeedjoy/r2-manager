import { describe, expect, it } from "vitest";
import { AppError } from "@r2-manager/shared";
import { readTextBodyWithLimit } from "../src/services/request-body";

describe("readTextBodyWithLimit", () => {
  it("reads a body within the limit", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: "hello",
    });
    await expect(readTextBodyWithLimit(request, 5)).resolves.toBe("hello");
  });

  it("rejects a declared oversized body before reading it", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "content-length": "100" },
      body: "small",
    });
    await expect(
      readTextBodyWithLimit(request, 10),
    ).rejects.toMatchObject<AppError>({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects a streamed body that crosses the limit", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: "too large",
    });
    await expect(
      readTextBodyWithLimit(request, 4),
    ).rejects.toMatchObject<AppError>({ code: "PAYLOAD_TOO_LARGE" });
  });
});
