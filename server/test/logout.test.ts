import { describe, expect, it } from "vitest";
import { SIGNED_OUT_USERNAME } from "@r2-manager/shared";
import logout from "../src/routes/v1/logout";
import { BASIC_AUTH_CHALLENGE, isSignedOutCredential } from "../src/middleware/basic-auth";

const basic = (credentials: string) => `Basic ${Buffer.from(credentials).toString("base64")}`;

describe("Basic Auth sign-out", () => {
  it("accepts the sign-out credentials so the browser caches them", async () => {
    const res = await logout.request("/", {
      headers: { authorization: basic(`${SIGNED_OUT_USERNAME}:${SIGNED_OUT_USERNAME}`) },
    });
    expect(res.status).toBe(204);
  });

  it("challenges anything else in the same realm as the management API", async () => {
    for (const headers of [{}, { authorization: basic("admin:hunter2") }]) {
      const res = await logout.request("/", { headers });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe(BASIC_AUTH_CHALLENGE);
    }
  });

  it("recognizes the sign-out username with or without a password", () => {
    expect(isSignedOutCredential(basic(`${SIGNED_OUT_USERNAME}:x`))).toBe(true);
    expect(isSignedOutCredential(basic(SIGNED_OUT_USERNAME))).toBe(true);
    expect(isSignedOutCredential(basic("admin:signed-out"))).toBe(false);
  });
});
