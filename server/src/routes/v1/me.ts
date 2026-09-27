import { Hono } from "hono";
import type { HonoEnv } from "../../types";

const app = new Hono<HonoEnv>();

/**
 * AUTH-04: the signed-in user as authGate resolved it. The UI uses the role to
 * decide which navigation to show; every route still enforces its own
 * capability check, so this is presentation only.
 */
app.get("/", (c) => {
  const { id, identity, displayName, role } = c.get("user");
  return c.json({ id, identity, displayName, role });
});

export default app;
