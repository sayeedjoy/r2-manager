import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor } from "../src/services/client-ip";

describe("clientIpFromForwardedFor", () => {
  it("uses the address added by the nearest trusted proxy", () => {
    expect(clientIpFromForwardedFor("198.51.100.9, 203.0.113.7", 1)).toBe(
      "203.0.113.7",
    );
    expect(clientIpFromForwardedFor("198.51.100.9, 203.0.113.7", 2)).toBe(
      "198.51.100.9",
    );
  });

  it("never returns an arbitrary header value", () => {
    expect(clientIpFromForwardedFor("attacker-controlled", 1)).toBe("unknown");
    expect(clientIpFromForwardedFor(undefined, 1)).toBe("unknown");
  });
});
