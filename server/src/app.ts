import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { AppError } from "@r2-manager/shared";
import type { HonoEnv } from "./types";
import type { AppConfig } from "./config";
import { createDb, type Database } from "./db/client";
import { R2S3Storage } from "./storage/r2-s3";
import type { Storage } from "./storage/storage";
import { correlationId } from "./middleware/correlation-id";
import { securityHeaders } from "./middleware/security-headers";
import { accessJwt } from "./middleware/access-jwt";
import { basicAuth } from "./middleware/basic-auth";
import { authGate } from "./middleware/auth-gate";

import me from "./routes/v1/me";
import buckets from "./routes/v1/buckets";
import objects from "./routes/v1/objects";
import folders from "./routes/v1/folders";
import uploads from "./routes/v1/uploads";
import metadata from "./routes/v1/metadata";
import shareRoutes from "./routes/v1/shares";
import settingsRoutes from "./routes/v1/settings";
import mail from "./routes/v1/mail";
import admin from "./routes/v1/admin";
import internal from "./routes/v1/internal";
import shareGateway from "./share-gateway/routes";

export interface CreateAppOptions {
  config: AppConfig;
  db?: Database;
  storage?: Storage;
}

export function createApp(opts: CreateAppOptions) {
  const app = new Hono<HonoEnv>();

  const db = opts.db ?? createDb(opts.config.env);
  const storage =
    opts.storage ??
    new R2S3Storage({
      accountId: opts.config.env.R2_ACCOUNT_ID,
      accessKeyId: opts.config.env.R2_ACCESS_KEY_ID,
      secretAccessKey: opts.config.env.R2_SECRET_ACCESS_KEY,
      endpoint: opts.config.r2Endpoint,
    });

  app.use("*", correlationId());
  app.use("*", async (c, next) => {
    c.set("config", opts.config);
    c.set("db", db);
    c.set("storage", storage);
    await next();
  });
  app.use("*", securityHeaders());
  app.use(
    "/api/*",
    cors({
      origin: opts.config.env.APP_BASE_URL,
      credentials: true,
    }),
  );

  // Share gateway (SHARE-02, AUTH-05): its own auth chain, no management login.
  app.route("/s", shareGateway);

  // Internal routes (cron trigger, mail webhook): secret/HMAC protected, not session auth.
  app.route("/api/v1/internal", internal);

  // Everything else under /api/v1 requires management authentication.
  const api = new Hono<HonoEnv>();
  api.use("*", accessJwt());
  api.use("*", basicAuth());
  api.use("*", authGate());
  api.route("/me", me);
  api.route("/buckets", buckets);
  api.route("/objects", objects);
  api.route("/folders", folders);
  api.route("/uploads", uploads);
  api.route("/metadata", metadata);
  api.route("/shares", shareRoutes);
  api.route("/settings", settingsRoutes);
  api.route("/mail", mail);
  api.route("/admin", admin);
  app.route("/api/v1", api);

  app.onError((err, c) => {
    const correlationIdValue = c.get("correlationId") ?? "unknown";

    if (err instanceof AppError) {
      return c.json(err.toBody(correlationIdValue), err.status as any);
    }
    if (err instanceof ZodError) {
      const appErr = new AppError("VALIDATION_ERROR", "Invalid request", err.flatten());
      return c.json(appErr.toBody(correlationIdValue), 400);
    }
    if (err instanceof HTTPException) {
      const appErr = new AppError(err.status === 401 ? "UNAUTHENTICATED" : err.status === 403 ? "UNAUTHORIZED" : "INTERNAL_ERROR", err.message);
      return c.json(appErr.toBody(correlationIdValue), err.status);
    }

    console.error(`[${correlationIdValue}]`, err);
    const appErr = new AppError("INTERNAL_ERROR", "Something went wrong");
    return c.json(appErr.toBody(correlationIdValue), 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
