import { Hono, type MiddlewareHandler } from "hono";
import { AppError, type AuthStatus } from "@r2-manager/shared";
import type { AuthUser, HonoEnv } from "../types";
import type { Database } from "../db/client";
import { DEFAULT_SETTINGS } from "../services/settings";
import { DEMO_READ_ONLY_MESSAGE } from "./storage";

/**
 * DEMO_MODE wiring. The demo is a public showcase: everyone is the same visitor, nothing is stored, and every
 * change is refused. createApp mounts these in place of sign-in, the database-backed routes, the share gateway
 * and the cron trigger.
 */

// An editor, so the upload/rename/share UI stays visible to show what the app does; the server refuses the writes.
export const DEMO_VISITOR: AuthUser = {
  id: "demo",
  identity: "demo@example.com",
  displayName: "Demo visitor",
  role: "editor",
  demo: true,
};

/**
 * Stands in for Postgres. The demo mounts no route that needs it, so reaching it means a new code path forgot about
 * demo mode: answer with the read-only message instead of trying to connect.
 */
export function unavailableDatabase(): Database {
  return new Proxy({} as Database, {
    get() {
      throw new AppError("UNAUTHORIZED", "This isn't available in the read-only demo");
    },
  });
}

/** Refuses every request that could change something. Reads (GET/HEAD) pass through. */
export const demoReadOnly = (): MiddlewareHandler<HonoEnv> => async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.method !== "OPTIONS") {
    throw new AppError("UNAUTHORIZED", DEMO_READ_ONLY_MESSAGE);
  }
  await next();
};

/** Replaces accessJwt + authGate: no login, no signup, every request is the demo visitor. */
export const demoVisitor = (): MiddlewareHandler<HonoEnv> => async (c, next) => {
  c.set("user", DEMO_VISITOR);
  await next();
};

/** Database-free answers for the reads the SPA makes on load. */
export const demoRoutes = new Hono<HonoEnv>();

demoRoutes.get("/auth/status", (c) =>
  c.json({
    authMode: c.var.config.env.AUTH_MODE,
    setupRequired: false,
    setupTokenRequired: false,
    passwordResetAvailable: false,
    demo: true,
  } satisfies AuthStatus),
);

demoRoutes.get("/me", (c) => {
  const { id, identity, displayName, role } = c.var.user;
  return c.json({
    id,
    identity,
    displayName,
    role,
    authMode: c.var.config.env.AUTH_MODE,
    hasPassword: false,
    twoFactorEnabled: false,
    recoveryCodesRemaining: 0,
    demo: true,
  });
});

demoRoutes.get("/settings", (c) => c.json(DEFAULT_SETTINGS));

// Share links need the database, so the demo never has any.
demoRoutes.get("/shares", (c) => c.json({ shares: [] }));
