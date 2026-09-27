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

export interface AppVariables {
  correlationId: string;
  user: AuthUser;
  config: AppConfig;
  db: Database;
  storage: Storage;
}

export interface HonoEnv {
  Variables: AppVariables;
}
