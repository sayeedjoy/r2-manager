export const ROLES = ["admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Named actions that authz.can() understands. Keep in sync with server/src/services/authz.ts. */
export const CAPABILITIES = [
  "bucket:list",
  "object:read",
  "object:write",
  "object:delete",
  "share:create",
  "share:revoke",
  "admin:manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Minimum role required for a capability when no explicit grant table is consulted. */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  admin: [...CAPABILITIES],
  editor: ["bucket:list", "object:read", "object:write", "object:delete", "share:create", "share:revoke"],
  viewer: ["bucket:list", "object:read"],
};

export function roleHasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
