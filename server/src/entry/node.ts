import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "../app";
import { loadConfig } from "../config";
import { closeDb } from "../db/client";
import type { HonoEnv } from "../types";

const config = loadConfig();
const apiApp = createApp({ config });

// Dokploy: one process serves the built frontend and the API (project-structure.md).
const app = new Hono<HonoEnv>();
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
