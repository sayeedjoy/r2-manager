import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "../app";
import { loadConfig } from "../config";
import { closeDb } from "../db/client";
import type { HonoEnv } from "../types";
import { securityHeaders } from "../middleware/security-headers";

// Load the repo-root .env regardless of the process's cwd (pnpm runs this
// script with cwd set to server/, so a bare "dotenv/config" would silently
// miss it and the server would fail to boot with "X: Required" errors).
loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const config = loadConfig();
if (config.demo) {
  console.warn(
    "DEMO_MODE is on: serving built-in sample files with no sign-in and no database. Never set it on a real deployment.",
  );
}
const apiApp = createApp({ config });

// Dokploy: one process serves the built frontend and the API (project-structure.md).
const app = new Hono<HonoEnv>();
// Container liveness probe (Docker HEALTHCHECK / Dokploy). Deliberately skips the DB and auth.
app.get("/healthz", (c) => c.text("ok"));
app.use("*", securityHeaders(config.env.NODE_ENV === "production"));
app.route("/", apiApp);
app.use("/*", serveStatic({ root: "../frontend/dist" }));
app.get("*", serveStatic({ path: "../frontend/dist/index.html" }));

const server = serve({ fetch: app.fetch, port: config.env.PORT }, (info) => {
  console.log(`r2-manager listening on http://localhost:${info.port}`);
});

async function shutdown() {
  console.log("Shutting down...");
  server.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
