import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { AppError, loginRequestSchema, type AuthStatus, type LoginResponse } from "@r2-manager/shared";
import type { AppConfig } from "../config";
import type { AuthUser, HonoEnv } from "../types";
import type { Database } from "../db/client";
import { DEFAULT_SETTINGS } from "../services/settings";
import { DEMO_READ_ONLY_MESSAGE } from "./storage";

/**
 * DEMO_MODE wiring. The demo is a public showcase: one shared account whose password is printed on the sign-in
 * page, nothing is stored, and every change is refused. createApp mounts these in place of the real sign-in, the
 * database-backed routes, the share gateway and the cron trigger.
 */

// An editor, so the upload/rename/share UI stays visible to show what the app does; the server refuses the writes.
export const DEMO_VISITOR: AuthUser = {
  id: "demo",
  identity: "demo@example.com",
  displayName: "Demo visitor",
  role: "editor",
  demo: true,
};

/** The only account that can sign in. Public on purpose: /auth/status hands it to the sign-in page to display. */
export const DEMO_LOGIN = { email: DEMO_VISITOR.identity, password: "r2-manager-demo" };

const DEMO_SESSION_SECONDS = 24 * 60 * 60;
// There is no sessions table, and the password is public, so the cookie has nothing to prove: it only records that
// this browser went through the sign-in page. A fixed value also keeps working across restarts and instances.
const DEMO_SESSION_VALUE = "demo";

function isSecure(config: AppConfig): boolean {
  return new URL(config.env.APP_BASE_URL).protocol === "https:";
}

function demoCookieName(config: AppConfig): string {
  return isSecure(config) ? "__Host-r2m_demo" : "r2m_demo";
}

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

// Signing in and out set or clear a cookie and store nothing, so they're the only non-GET requests let through.
const DEMO_ALLOWED_POSTS = new Set(["/api/v1/auth/login", "/api/v1/auth/logout"]);

/** Refuses every request that could change something. Reads (GET/HEAD) pass through. */
export const demoReadOnly = (): MiddlewareHandler<HonoEnv> => async (c, next) => {
  const safe = c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS";
  if (!safe && !(c.req.method === "POST" && DEMO_ALLOWED_POSTS.has(c.req.path))) {
    throw new AppError("UNAUTHORIZED", DEMO_READ_ONLY_MESSAGE);
  }
  await next();
};

/** Replaces accessJwt + authGate: a browser that signed in with the demo account is the demo visitor. */
export const demoVisitor = (): MiddlewareHandler<HonoEnv> => async (c, next) => {
  if (getCookie(c, demoCookieName(c.var.config)) !== DEMO_SESSION_VALUE) {
    throw new AppError("UNAUTHENTICATED", "Sign in with the demo account");
  }
  c.set("user", DEMO_VISITOR);
  await next();
};

/**
 * Replaces routes/v1/auth.ts and sits outside demoVisitor like it does. There is no first-run setup (registration),
 * password reset or 2FA here: those requests are refused by demoReadOnly before they reach a route.
 */
export const demoAuthRoutes = new Hono<HonoEnv>();

demoAuthRoutes.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

demoAuthRoutes.get("/status", (c) =>
  c.json({
    authMode: c.var.config.env.AUTH_MODE,
    setupRequired: false,
    setupTokenRequired: false,
    passwordResetAvailable: false,
    demo: true,
    demoLogin: DEMO_LOGIN,
  } satisfies AuthStatus),
);

demoAuthRoutes.post("/login", async (c) => {
  const body = loginRequestSchema.parse(await c.req.json());
  if (body.email !== DEMO_LOGIN.email || body.password !== DEMO_LOGIN.password) {
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password");
  }
  const { config } = c.var;
  setCookie(c, demoCookieName(config), DEMO_SESSION_VALUE, {
    httpOnly: true,
    secure: isSecure(config),
    sameSite: "Strict",
    path: "/",
    maxAge: DEMO_SESSION_SECONDS,
  });
  return c.json({ mfaRequired: false } satisfies LoginResponse);
});

demoAuthRoutes.post("/logout", (c) => {
  const { config } = c.var;
  deleteCookie(c, demoCookieName(config), { path: "/", secure: isSecure(config) });
  return c.body(null, 204);
});

/** Database-free answers for the reads the SPA makes once signed in. */
export const demoRoutes = new Hono<HonoEnv>();

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
