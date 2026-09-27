import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { AuditQuery } from "@r2-manager/shared";
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

/** Escapes LIKE wildcards so a search for "50%" or "file_name" matches literally. Postgres's default escape is "\". */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * ADMIN-01: one page of the audit trail, newest first, plus the total matching count for pagination.
 * The id tie-break keeps page boundaries stable when several events share a timestamp.
 */
export async function listAuditEvents(db: Database, query: AuditQuery) {
  const conditions: SQL[] = [];
  if (query.outcome) conditions.push(eq(auditEvents.outcome, query.outcome));
  if (query.q) {
    const pattern = `%${escapeLikePattern(query.q)}%`;
    conditions.push(
      or(ilike(auditEvents.action, pattern), ilike(auditEvents.target, pattern), ilike(auditEvents.correlationId, pattern))!,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [events, [totals]] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(auditEvents).where(where),
  ]);

  return { events, total: totals?.total ?? 0, limit: query.limit, offset: query.offset };
}
