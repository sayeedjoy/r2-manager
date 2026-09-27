# R2 Manager

A self-hosted file manager for Cloudflare R2 buckets: browsing, uploads, previews, protected share links, and email-attachment ingestion. See [docs/Cloudflare R2 File Manager SRS.md](docs/Cloudflare%20R2%20File%20Manager%20SRS.md) for requirements and [docs/project-structure.md](docs/project-structure.md) for the architecture this repo implements.

## Status

Both release stages from the SRS's release plan (§9) are implemented:

- **Core:** authentication (Cloudflare Access and/or Basic Auth), RBAC, bucket browsing (list/grid, name filter), folder operations, drag-and-drop multipart upload/download, previews (PDF/image/text/Markdown/CSV/JSON/JSONL), object operations, and the audit trail.
- **Complete feature set:** folder upload (drag-and-drop and picker, preserving hierarchy), bulk move/copy/delete/download-as-zip, a metadata editor, an in-browser text/Markdown/CSV/JSON editor with ETag conflict detection, protected shares with password/expiry/download-limit and a revoke UI, Email Routing ingestion with an attachment inbox, and admin settings/users/grants/audit/health.

**Later enhancements** (SRS §9, explicitly out of scope for now): soft delete/retention policies, full-text/advanced search, malware scanning, and format-aware editors (CSV table editing, diff-before-save).

## Local development

```bash
pnpm install
cp .env.example .env
pnpm services:up                                          # Postgres + MinIO (S3-compatible R2 stand-in) via Docker
pnpm --filter server run hash-password 'your-password'   # paste result into BASIC_AUTH_PASSWORD_HASH
pnpm db:migrate
pnpm --filter server run create-admin                     # first admin; defaults to BASIC_AUTH_USERNAME
pnpm dev                                                  # API on :8787, Vite frontend on :5173
```

See [docs/local-development.md](docs/local-development.md) for the `.env` values that match the Docker services.

## Deployment

- [docs/deploy-dokploy.md](docs/deploy-dokploy.md) - Docker on Dokploy, one process serving API + frontend.
- [docs/deploy-vercel.md](docs/deploy-vercel.md) - Vercel functions + static frontend.
- [email-relay/](email-relay/) - the one piece that still runs on Cloudflare (Email Routing -> Worker -> signed webhook to the app).

## Repository layout

See [docs/project-structure.md](docs/project-structure.md) for the full breakdown. In short: `shared/` (zod schemas, key/role helpers used by both sides), `server/` (Hono API, Postgres via Drizzle, R2 via its S3 API), `frontend/` (Vite + React + shadcn/ui), `email-relay/` (Cloudflare Worker).
