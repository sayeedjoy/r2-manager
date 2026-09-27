# R2 Manager

A self-hosted file manager for Cloudflare R2 buckets: browsing, uploads, previews, protected share links, and email-attachment ingestion. See [docs/Cloudflare R2 File Manager SRS.md](docs/Cloudflare%20R2%20File%20Manager%20SRS.md) for requirements and [docs/project-structure.md](docs/project-structure.md) for the architecture this repo implements.

## Status

Core (P0) surface is implemented: authentication (Cloudflare Access and/or Basic Auth), RBAC, bucket browsing, folder operations, drag-and-drop multipart upload/download, HTTP metadata, protected shares with password/expiry/download-limit, an email inbox with attachment copy-to-folder, admin users/settings/audit/health, and the Postgres schema/migrations for all of it. Format-aware editors, in-browser previews beyond basic download, and the Logpush viewer (P1/P2 in the SRS) are not yet built out in the frontend.

## Local development

```bash
pnpm install
cp .env.example .env
# fill in DATABASE_URL, R2_*, and either Access or Basic Auth settings
pnpm --filter server run hash-password 'your-password'   # paste result into BASIC_AUTH_PASSWORD_HASH
pnpm db:migrate
pnpm dev   # runs the API on :8787 and the Vite frontend (proxied to it) together
```

Open http://localhost:5173 (frontend dev server) once both are running.

## Deployment

- [docs/deploy-dokploy.md](docs/deploy-dokploy.md) - Docker on Dokploy, one process serving API + frontend.
- [docs/deploy-vercel.md](docs/deploy-vercel.md) - Vercel functions + static frontend.
- [email-relay/](email-relay/) - the one piece that still runs on Cloudflare (Email Routing -> Worker -> signed webhook to the app).

## Repository layout

See [docs/project-structure.md](docs/project-structure.md) for the full breakdown. In short: `shared/` (zod schemas, key/role helpers used by both sides), `server/` (Hono API, Postgres via Drizzle, R2 via its S3 API), `frontend/` (Vite + React + shadcn/ui), `email-relay/` (Cloudflare Worker).
