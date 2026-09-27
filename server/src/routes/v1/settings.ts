import { Hono } from "hono";
import type { HonoEnv } from "../../types";
import { getSettings } from "../../services/settings";

const app = new Hono<HonoEnv>();

/**
 * Read-only limits every authenticated user needs client-side (preview/editor
 * size ceilings, etc.) - distinct from /admin/settings, which also allows
 * writing and is gated by admin:manage.
 */
app.get("/", async (c) => {
  return c.json(await getSettings(c.get("db")));
});

export default app;
