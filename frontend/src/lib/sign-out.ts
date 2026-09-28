import { SIGNED_OUT_USERNAME, type AuthMode } from "@r2-manager/shared";

/**
 * Browsers keep Basic credentials until they're closed. Authenticating once
 * with the reserved sign-out username replaces them, so the next API call
 * brings back the login prompt. fetch() can't pass credentials this way;
 * XMLHttpRequest can.
 */
function forgetBasicCredentials(): Promise<void> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/v1/logout", true, SIGNED_OUT_USERNAME, SIGNED_OUT_USERNAME);
    xhr.onloadend = () => resolve();
    xhr.send();
  });
}

/**
 * Ends the session for whichever auth modes are on (AUTH-01, AUTH-02). Both
 * cases do a full page load, which also drops cached query data.
 */
export async function signOut(authMode: AuthMode): Promise<void> {
  if (authMode !== "access") await forgetBasicCredentials();
  // Cloudflare serves this path on any hostname behind Access and clears the app's Access cookie.
  window.location.assign(authMode === "basic" ? "/signed-out" : "/cdn-cgi/access/logout");
}
