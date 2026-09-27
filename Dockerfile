# Dokploy: builds the frontend and server into one image, served by the Node entry point.
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY frontend/package.json frontend/package.json
COPY email-relay/package.json email-relay/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 8787
CMD ["node", "server/dist/entry/node.js"]
