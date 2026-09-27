import { describe, expect, it } from "vitest";
import { auditQuerySchema } from "@r2-manager/shared";
import { escapeLikePattern } from "../src/services/audit";

describe("auditQuerySchema", () => {
  it("defaults to the first page of 25", () => {
    expect(auditQuerySchema.parse({})).toEqual({ limit: 25, offset: 0 });
  });

  it("coerces query-string numbers and trims the search", () => {
    expect(auditQuerySchema.parse({ limit: "50", offset: "100", outcome: "failure", q: "  upload " })).toEqual({
      limit: 50,
      offset: 100,
      outcome: "failure",
      q: "upload",
    });
  });

  it("rejects page sizes over 100, negative offsets and unknown outcomes", () => {
    expect(() => auditQuerySchema.parse({ limit: "500" })).toThrow();
    expect(() => auditQuerySchema.parse({ offset: "-1" })).toThrow();
    expect(() => auditQuerySchema.parse({ outcome: "maybe" })).toThrow();
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards and the escape character itself", () => {
    // Input: 50%_off\x  ->  Output: 50\%\_off\\x
    expect(escapeLikePattern(String.raw`50%_off\x`)).toBe(String.raw`50\%\_off\\x`);
  });

  it("leaves ordinary text alone", () => {
    expect(escapeLikePattern("upload.complete")).toBe("upload.complete");
  });
});
