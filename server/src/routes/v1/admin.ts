import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  AppError,
  appSettingsSchema,
  auditQuerySchema,
  normalizeFolderKey,
  upsertUserSchema,
} from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { assertBucketConfigured } from "../../config";
import { requireCapability } from "../../services/authz";
import { users, grants } from "../../db/schema";
import { getSettings, updateSettings } from "../../services/settings";
import { listAuditEvents, recordAudit } from "../../services/audit";

const app = new Hono<HonoEnv>();

app.use("*", async (c, next) => {
  await requireCapability(c.get("db"), c.get("user"), "admin:manage");
  await next();
});

app.get("/users", async (c) => {
  const db = c.get("db");
  const rows = await db.query.users.findMany();
  const allGrants = await db.query.grants.findMany();
  return c.json({
    users: rows.map((u) => ({
      id: u.id,
      identity: u.identity,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      grants: allGrants
        .filter((g) => g.userId === u.id)
        .map((g) => ({ bucket: g.bucket, prefix: g.prefix })),
    })),
  });
});

app.post("/users", async (c) => {
  const body = upsertUserSchema.parse(await c.req.json());
  const db = c.get("db");
  const normalizedGrants = body.grants.map((grant) => ({
    bucket: grant.bucket,
    prefix: grant.prefix.trim() === "" ? "" : normalizeFolderKey(grant.prefix),
  }));
  for (const grant of normalizedGrants)
    assertBucketConfigured(c.get("config"), grant.bucket);

  const [targetUser] = await db
    .insert(users)
    .values({
      identity: body.identity,
      displayName: body.displayName,
      role: body.role,
    })
    .onConflictDoUpdate({
      target: users.identity,
      set: { displayName: body.displayName, role: body.role },
    })
    .returning();
  if (!targetUser)
    throw new AppError("INTERNAL_ERROR", "Failed to create or update user");

  await db.delete(grants).where(eq(grants.userId, targetUser.id));
  if (normalizedGrants.length > 0) {
    await db
      .insert(grants)
      .values(
        normalizedGrants.map((g) => ({
          userId: targetUser.id,
          bucket: g.bucket,
          prefix: g.prefix,
        })),
      );
  }

  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.user.upsert",
    target: targetUser.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });

  return c.json({ id: targetUser.id });
});

/** AUTH-06: revoke a user's app permissions immediately. */
app.post("/users/:id/disable", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [user] = await db
    .update(users)
    .set({ status: "disabled" })
    .where(eq(users.id, id))
    .returning();
  if (!user) throw new AppError("NOT_FOUND", "User not found");

  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.user.disable",
    target: user.identity,
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json({ ok: true });
});

app.get("/settings", async (c) => {
  return c.json(await getSettings(c.get("db")));
});

app.put("/settings", async (c) => {
  const body = appSettingsSchema.partial().parse(await c.req.json());
  const db = c.get("db");
  const next = await updateSettings(db, body);
  await recordAudit(db, {
    actorId: c.get("user").id,
    action: "admin.settings.update",
    outcome: "success",
    correlationId: c.get("correlationId"),
  });
  return c.json(next);
});

/** ADMIN-01: audit trail, most recent first, paginated and filterable (?limit, ?offset, ?outcome, ?q). */
app.get("/audit", async (c) => {
  const query = auditQuerySchema.parse(c.req.query());
  return c.json(await listAuditEvents(c.get("db"), query));
});

/** ADMIN-03: deployment health, without exposing secrets. */
app.get("/health", async (c) => {
  const { db, storage, config } = c.var;
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await db.execute("select 1");
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    await storage.list(config.buckets[0]!, "", { limit: 1 });
    checks.storage = "ok";
  } catch {
    checks.storage = "error";
  }

  checks.authMode = "ok"; // reaching this handler already proved auth is configured (AUTH-03)
  checks.mailWebhook = config.env.MAIL_WEBHOOK_SECRET ? "ok" : "error";

  return c.json({ checks, buckets: config.buckets });
});

export default app;
