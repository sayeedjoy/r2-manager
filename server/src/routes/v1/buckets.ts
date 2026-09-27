import { Hono } from "hono";
import type { HonoEnv } from "../../types";
import { grantsFor } from "../../services/authz";

const app = new Hono<HonoEnv>();

/** FILE-01: lists buckets the current user may browse, derived from role/grants. Denied buckets are never listed. */
app.get("/", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const config = c.get("config");

  const grants = await grantsFor(db, user, config.buckets);
  const buckets = [...new Set(grants.map((g) => g.bucket))];

  return c.json({ buckets });
});

export default app;
