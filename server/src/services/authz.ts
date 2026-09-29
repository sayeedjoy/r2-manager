import { eq } from "drizzle-orm";
import { AppError, roleHasCapability, type Capability } from "@r2-manager/shared";
import { isWithinPrefix } from "@r2-manager/shared";
import type { Database } from "../db/client";
import { grants } from "../db/schema";
import type { AuthUser } from "../types";

/**
 * The single permission check in the app (AUTH-04). Every route calls this
 * through a service rather than deciding authorization itself. Admins bypass
 * prefix grants; editors/viewers must hold a grant covering bucket+prefix. The
 * DEMO_MODE visitor has no grants table to read, so it reaches every configured
 * bucket; the demo middleware and storage keep it read-only.
 */
export async function can(
  db: Database,
  user: AuthUser,
  capability: Capability,
  target?: { bucket: string; key?: string },
): Promise<boolean> {
  if (!roleHasCapability(user.role, capability)) return false;
  if (user.role === "admin" || user.demo) return true;
  if (!target) return true; // capability doesn't need a bucket/prefix scope (e.g. bucket:list)

  const userGrants = await db.query.grants.findMany({ where: eq(grants.userId, user.id) });
  return userGrants.some(
    (g) => g.bucket === target.bucket && isWithinPrefix(target.key ?? "", g.prefix),
  );
}

/** Throws AppError("UNAUTHORIZED") if the user lacks the capability for this target (AUTH-04). */
export async function requireCapability(
  db: Database,
  user: AuthUser,
  capability: Capability,
  target?: { bucket: string; key?: string },
): Promise<void> {
  const allowed = await can(db, user, capability, target);
  if (!allowed) {
    throw new AppError("UNAUTHORIZED", "You do not have permission to perform this action");
  }
}

/** Returns the list of bucket/prefix grants visible to the user (admins see every configured bucket, unscoped). */
export async function grantsFor(db: Database, user: AuthUser, configuredBuckets: string[]) {
  if (user.role === "admin" || user.demo) {
    return configuredBuckets.map((bucket) => ({ bucket, prefix: "" }));
  }
  const userGrants = await db.query.grants.findMany({ where: eq(grants.userId, user.id) });
  return userGrants.map((g) => ({ bucket: g.bucket, prefix: g.prefix }));
}
