import { z } from "zod";

export const AUDIT_PAGE_SIZES = [25, 50, 100] as const;

/** ADMIN-01: one page of the audit trail, optionally filtered by outcome and a free-text search. */
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  outcome: z.enum(["success", "failure"]).optional(),
  /** Case-insensitive substring match on action, target and correlation ID. */
  q: z.string().trim().max(200).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
