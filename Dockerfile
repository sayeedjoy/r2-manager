# syntax=docker/dockerfile:1
# Dokploy image: one Node process serves the API, the share gateway and the built SPA.
# The server is bundled with esbuild (server/bundle.mjs), so the runtime stage carries no node_modules:
# just Node, three .mjs bundles, the SPA's static files and the SQL migrations. See docs/deploy-dokploy.md.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS build
ENV CI=true
RUN corepack enable
WORKDIR /app

# Manifests first so the dependency layer is cached until one of them changes.
# email-relay's manifest is only there to satisfy the lockfile; its deps (wrangler/workerd) are skipped.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY frontend/package.json frontend/package.json
COPY email-relay/package.json email-relay/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter frontend... --filter @r2-manager/server...

COPY shared shared
COPY server server
COPY frontend frontend
RUN pnpm --filter frontend build \
 && pnpm --filter @r2-manager/server bundle


FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    NODE_OPTIONS=--enable-source-maps
# Same layout as the repo, run from server/: entry/node.ts serves ../frontend/dist and
# db/migrate.ts reads ./src/db/migrations, both relative to the working directory.
WORKDIR /app/server
COPY --from=build --chown=node:node /app/frontend/dist /app/frontend/dist
COPY --from=build --chown=node:node /app/server/src/db/migrations ./src/db/migrations
COPY --from=build --chown=node:node /app/server/dist/bundle ./dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
# Apply pending migrations, then replace the shell with Node so it gets SIGTERM directly.
# Set SKIP_MIGRATIONS=1 to run them yourself instead (node dist/migrate.mjs).
CMD ["sh", "-c", "[ \"$SKIP_MIGRATIONS\" = \"1\" ] || node dist/migrate.mjs && exec node dist/server.mjs"]
