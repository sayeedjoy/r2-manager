import { describe, expect, it } from "vitest";
import { contentDisposition } from "../src/services/content-disposition";

describe("contentDisposition", () => {
  it("encodes quotes, control characters, and unicode without header injection", () => {
    const value = contentDisposition('report"\r\nX-Evil: yes-\u00e9.html');
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).toContain('filename="report___X-Evil: yes-_.html"');
    expect(value).toContain("filename*=UTF-8''");
  });
});
