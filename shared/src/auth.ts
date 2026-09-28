export type AuthMode = "access" | "basic" | "both";

/**
 * Basic Auth has no server session to end, so signing out swaps the browser's
 * cached credentials for this username, which never authenticates. The next
 * request then gets a fresh login prompt. It must not match BASIC_AUTH_USERNAME.
 */
export const SIGNED_OUT_USERNAME = "signed-out";
