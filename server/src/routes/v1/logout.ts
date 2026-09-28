import { Hono } from "hono";
import type { HonoEnv } from "../../types";
import { BASIC_AUTH_CHALLENGE, isSignedOutCredential } from "../../middleware/basic-auth";

const app = new Hono<HonoEnv>();

/**
 * AUTH-02: Basic Auth sign-out. Browsers keep Basic credentials until they're
 * closed and have no API to forget them. So the client requests this with
 * SIGNED_OUT_USERNAME as XHR credentials, and a 204 makes the browser cache
 * those in place of the real ones. Any other request gets the same challenge
 * authGate sends, so the browser retries with the XHR credentials.
 * Mounted outside the management auth chain: it changes no server state.
 */
app.get("/", (c) => {
  const header = c.req.header("authorization");
  if (header?.startsWith("Basic ") && isSignedOutCredential(header)) {
    return c.body(null, 204);
  }
  c.header("WWW-Authenticate", BASIC_AUTH_CHALLENGE);
  return c.body(null, 401);
});

export default app;
