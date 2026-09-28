import type { Database } from "../db/client";
import { deleteExpiredResetTokens } from "../services/auth";
import { deleteExpiredSessions } from "../services/sessions";

/** Removes expired sign-in sessions and spent or expired password reset links. */
export async function cleanupAuthRecords(db: Database): Promise<{ sessions: number; resetTokens: number }> {
  const [sessions, resetTokens] = await Promise.all([deleteExpiredSessions(db), deleteExpiredResetTokens(db)]);
  return { sessions, resetTokens };
}
