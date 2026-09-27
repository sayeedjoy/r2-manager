import { Hono } from "hono";
import { AppError, createShareSchema } from "@r2-manager/shared";
import type { HonoEnv } from "../../types";
import { assertBucketConfigured } from "../../config";
import { requireCapability } from "../../services/authz";
import { createShare, listSharesForObject, revokeShare } from "../../services/shares";
import { recordAudit } from "../../services/audit";
import { getSettings } from "../../services/settings";

const app = new Hono<HonoEnv>();

function toShareDto(row: Awaited<ReturnType<typeof listSharesForObject>>[number], url: string | null = null) {
  return {
    id: row.id,
    bucket: row.bucket,
    key: row.key,
    hasPassword: !!row.passwordHash,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    maxDownloads: row.maxDownloads,
    reservedDownloads: row.reservedDownloads,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    deliveryMode: row.deliveryMode,
    inlinePreview: row.inlinePreview,
    // The raw token is never stored, so the link can only be shown once, right after creation.
    url,
  };
}

app.post("/", async (c) => {
  const body = createShareSchema.parse(await c.req.json());
  const { config, db, user, storage } = c.var;
  assertBucketConfigured(config, body.bucket);
  await requireCapability(db, user, "share:create", { bucket: body.bucket, key: body.key });

  const settings = await getSettings(db);
  const expiresAt =
    body.expiresAt ??
    (settings.defaultShareExpiryHours
      ? new Date(Date.now() + settings.defaultShareExpiryHours * 3600 * 1000).toISOString()
      : undefined);
  const maxDownloads = body.maxDownloads ?? settings.defaultShareMaxDownloads ?? undefined;

  const { row, token } = await createShare(db, storage, {
    ...body,
    expiresAt,
    maxDownloads,
    createdBy: user.id,
  });

  await recordAudit(db, {
    actorId: user.id,
    action: "share.create",
    target: `${body.bucket}/${body.key}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { shareId: row.id },
  });

  return c.json(toShareDto(row, `${config.env.APP_BASE_URL}/s/${token}`));
});

app.get("/", async (c) => {
  const bucket = c.req.query("bucket");
  const key = c.req.query("key");
  if (!bucket || !key) return c.json({ error: "bucket and key are required" }, 400);

  const { config, db, user } = c.var;
  assertBucketConfigured(config, bucket);
  await requireCapability(db, user, "object:read", { bucket, key });

  const rows = await listSharesForObject(db, bucket, key);
  return c.json({ shares: rows.map((r) => toShareDto(r)) });
});

app.post("/:id/revoke", async (c) => {
  const id = c.req.param("id");
  const { db, user } = c.var;

  const share = await db.query.shares.findFirst({ where: (s, { eq }) => eq(s.id, id) });
  if (!share) throw new AppError("NOT_FOUND", "Share not found");
  await requireCapability(db, user, "share:revoke", { bucket: share.bucket, key: share.key });

  await revokeShare(db, id);
  await recordAudit(db, {
    actorId: user.id,
    action: "share.revoke",
    target: `${share.bucket}/${share.key}`,
    outcome: "success",
    correlationId: c.get("correlationId"),
    details: { shareId: id },
  });
  return c.json({ ok: true });
});

export default app;
