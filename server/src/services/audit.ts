import type { Database } from "../db/client";
import { auditEvents } from "../db/schema";

export interface AuditEventInput {
  actorId: string | null;
  action: string;
  target?: string;
  outcome: "success" | "failure";
  correlationId: string;
  details?: Record<string, unknown>;
}

/** ADMIN-01: records every mutation. Never pass passwords, tokens, or file contents in `details`. */
export async function recordAudit(db: Database, event: AuditEventInput): Promise<void> {
  await db.insert(auditEvents).values({
    actorId: event.actorId,
    action: event.action,
    target: event.target,
    outcome: event.outcome,
    correlationId: event.correlationId,
    details: event.details ?? null,
  });
}
