import type { AuthMode } from "@r2-manager/shared";
import { api } from "@/lib/api";

/**
 * Ends the app session, then Cloudflare Access's too when it's in front (AUTH-01, AUTH-02). Both cases do a
 * full page load, which also drops cached query data.
 */
export async function signOut(authMode: AuthMode): Promise<void> {
  if (authMode !== "access") await api.logout().catch(() => {});
  // Cloudflare serves this path on any hostname behind Access and clears the app's Access cookie.
  window.location.assign(authMode === "password" ? "/login?signedOut=1" : "/cdn-cgi/access/logout");
}

/** Only same-app paths are followed after sign-in, so a crafted ?next= can't bounce the user to another site. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
