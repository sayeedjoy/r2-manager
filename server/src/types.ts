import type { Role } from "@r2-manager/shared";
import type { AppConfig } from "./config";
import type { Database } from "./db/client";
import type { Storage } from "./storage/storage";

export interface AuthUser {
  id: string;
  identity: string;
  displayName: string;
  role: Role;
}

export interface AccessIdentity {
  email: string;
}

export interface AppVariables {
  correlationId: string;
  user: AuthUser;
  /** The password-login session behind this request; unset in "access" mode. */
  sessionId?: string;
  /** Set by accessJwt when a valid Cloudflare Access assertion came with the request (AUTH-01). */
  accessIdentity?: AccessIdentity;
  config: AppConfig;
  db: Database;
  storage: Storage;
}

export interface HonoEnv {
  Variables: AppVariables;
}
