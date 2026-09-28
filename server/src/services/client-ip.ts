import { isIP } from "node:net";

/** Selects the address added by the configured trusted proxy instead of trusting an arbitrary raw header. */
export function clientIpFromForwardedFor(
  header: string | undefined,
  trustedProxyHops: number,
): string {
  if (!header || trustedProxyHops < 1) return "unknown";
  const chain = header.split(",").map((part) => part.trim());
  const candidate = chain.at(-trustedProxyHops);
  return candidate && isIP(candidate) !== 0 ? candidate : "unknown";
}
