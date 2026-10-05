import { createHash } from "node:crypto";
import { Hono } from "hono";
import { auditQuerySchema, type SmtpSettings, type UserRecord } from "@r2-manager/shared";
import { DEMO_BUCKET } from "../config";
import type { HonoEnv } from "../types";
import { DEFAULT_SETTINGS } from "../services/settings";
import { DEMO_VISITOR } from "./routes";

/**
 * DEMO_MODE's admin area: made-up users, settings, email delivery, audit log and health, so visitors can see those
 * screens. Everything here is read from memory; saving is refused by demoReadOnly like every other change.
 */

const STARTED = Date.now();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ago = (ms: number) => new Date(STARTED - ms).toISOString();

/** A stable UUID-shaped value, so ids and correlation IDs look real and don't change between requests. */
function sampleUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const PRIYA = sampleUuid("user:priya");
const MARCUS = sampleUuid("user:marcus");
const SOFIA = sampleUuid("user:sofia");
const TOM = sampleUuid("user:tom");

const USERS: UserRecord[] = [
  {
    id: DEMO_VISITOR.id,
    identity: DEMO_VISITOR.identity,
    displayName: DEMO_VISITOR.displayName,
    role: DEMO_VISITOR.role,
    status: "active",
    grants: [],
    hasPassword: true,
    twoFactorEnabled: false,
    lastLoginAt: ago(0),
    createdAt: ago(120 * DAY),
  },
  {
    id: PRIYA,
    identity: "priya@example.com",
    displayName: "Priya Raman",
    role: "admin",
    status: "active",
    grants: [],
    hasPassword: true,
    twoFactorEnabled: true,
    lastLoginAt: ago(3 * 60 * MINUTE),
    createdAt: ago(118 * DAY),
  },
  {
    id: MARCUS,
    identity: "marcus@example.com",
    displayName: "Marcus Lee",
    role: "editor",
    status: "active",
    grants: [
      { bucket: DEMO_BUCKET, prefix: "documents/" },
      { bucket: DEMO_BUCKET, prefix: "images/" },
    ],
    hasPassword: true,
    twoFactorEnabled: false,
    lastLoginAt: ago(26 * 60 * MINUTE),
    createdAt: ago(64 * DAY),
  },
  {
    id: SOFIA,
    identity: "sofia@example.com",
    displayName: "Sofia Alvarez",
    role: "viewer",
    status: "active",
    grants: [{ bucket: DEMO_BUCKET, prefix: "data/" }],
    // Invited but hasn't chosen a password yet.
    hasPassword: false,
    twoFactorEnabled: false,
    lastLoginAt: null,
    createdAt: ago(2 * DAY),
  },
  {
    id: TOM,
    identity: "tom@example.com",
    displayName: "Tom Becker",
    role: "editor",
    status: "disabled",
    grants: [{ bucket: DEMO_BUCKET, prefix: "" }],
    hasPassword: true,
    twoFactorEnabled: false,
    lastLoginAt: ago(41 * DAY),
    createdAt: ago(110 * DAY),
  },
];

const SMTP: SmtpSettings = {
  enabled: true,
  provider: "brevo",
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  username: "files@example.com",
  passwordSet: true,
  fromEmail: "files@example.com",
  fromName: "R2 Manager",
  updatedAt: ago(30 * DAY),
};

type Outcome = "success" | "failure";

// [actor, action, target, outcome], newest first. The action names are the ones the real routes record.
const AUDIT_SAMPLES: [string | null, string, string | null, Outcome][] = [
  [DEMO_VISITOR.id, "auth.login", DEMO_VISITOR.identity, "success"],
  [MARCUS, "upload.complete", `${DEMO_BUCKET}/images/uploads-chart.svg`, "success"],
  [MARCUS, "share.create", `${DEMO_BUCKET}/documents/overview.pdf`, "success"],
  [PRIYA, "admin.settings.update", null, "success"],
  [null, "auth.login", "tom@example.com", "failure"],
  [MARCUS, "object.rename", `${DEMO_BUCKET}/documents/release-notes.txt`, "success"],
  [PRIYA, "admin.user.upsert", "sofia@example.com", "success"],
  [PRIYA, "admin.user.invite", "sofia@example.com", "success"],
  [MARCUS, "metadata.update", `${DEMO_BUCKET}/data/app-config.json`, "success"],
  [MARCUS, "object.edit", `${DEMO_BUCKET}/code/settings.yaml`, "success"],
  [PRIYA, "admin.smtp.test", "priya@example.com", "success"],
  [MARCUS, "folder.create", `${DEMO_BUCKET}/archive/`, "success"],
  [MARCUS, "folder.tree-op.move", `${DEMO_BUCKET}/logs/`, "failure"],
  [PRIYA, "account.2fa.enable", "priya@example.com", "success"],
  [MARCUS, "share.revoke", `${DEMO_BUCKET}/data/sales-2026.csv`, "success"],
  [PRIYA, "admin.user.disable", "tom@example.com", "success"],
  [MARCUS, "object.delete", DEMO_BUCKET, "success"],
  [MARCUS, "object.bulk-download", DEMO_BUCKET, "success"],
  [PRIYA, "auth.login.2fa", "priya@example.com", "failure"],
  [MARCUS, "auth.logout", "marcus@example.com", "success"],
];

// Three passes over the samples, each event about an hour and a half older than the last: enough for a few pages.
const AUDIT_EVENTS = Array.from({ length: AUDIT_SAMPLES.length * 3 }, (_, i) => {
  const [actorId, action, target, outcome] = AUDIT_SAMPLES[i % AUDIT_SAMPLES.length]!;
  return {
    id: sampleUuid(`audit:${i}`),
    actorId,
    action,
    target,
    outcome,
    correlationId: sampleUuid(`correlation:${i}`),
    details: null,
    createdAt: ago((i * 97 + (i % 7) * 11) * MINUTE),
  };
});

export const demoAdminRoutes = new Hono<HonoEnv>();

demoAdminRoutes.get("/users", (c) => c.json({ users: USERS }));

demoAdminRoutes.get("/settings", (c) => c.json(DEFAULT_SETTINGS));

demoAdminRoutes.get("/smtp", (c) => c.json(SMTP));

/** Same paging and filters as services/audit.ts listAuditEvents (ADMIN-01), over the sample events. */
demoAdminRoutes.get("/audit", (c) => {
  const query = auditQuerySchema.parse(c.req.query());
  const q = query.q?.toLowerCase();
  const matching = AUDIT_EVENTS.filter(
    (e) =>
      (!query.outcome || e.outcome === query.outcome) &&
      (!q || [e.action, e.target, e.correlationId].some((field) => field?.toLowerCase().includes(q))),
  );
  return c.json({
    events: matching.slice(query.offset, query.offset + query.limit),
    total: matching.length,
    limit: query.limit,
    offset: query.offset,
  });
});

// What a healthy deployment reports (ADMIN-03). The demo itself has no Postgres or SMTP to check.
demoAdminRoutes.get("/health", (c) =>
  c.json({
    checks: { database: "ok", storage: "ok", authMode: "ok", smtp: "ok" },
    buckets: c.var.config.buckets,
  }),
);
