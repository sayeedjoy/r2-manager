import { Hono } from "hono";
import type { HonoEnv } from "../../types";
import { cleanupExpiredUploads } from "../../jobs/upload-cleanup";
import { cleanupAuthRecords } from "../../jobs/auth-cleanup";
import { timingSafeStringEqual } from "../../services/crypto";

const app = new Hono<HonoEnv>();

/** Vercel Cron / Dokploy schedule trigger for background jobs (upload cleanup, expired sessions and reset links). */
app.post("/cron", async (c) => {
  const { config, db, storage } = c.var;
  const secret = config.env.CRON_SECRET;
  const provided = c.req.header("x-cron-secret");
  if (!secret || !provided || !timingSafeStringEqual(provided, secret))
    return c.json({ error: "Unauthorized" }, 401);

  const expiredUploads = await cleanupExpiredUploads(db, storage);
  const expiredAuth = await cleanupAuthRecords(db);
  return c.json({ ok: true, expiredUploads, expiredAuth });
});

export default app;
