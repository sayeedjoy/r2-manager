# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-hosted file manager for Cloudflare R2 buckets. It covers browsing, multipart uploads, previews, an in-browser editor, protected share links and email-attachment ingestion. Requirements live in `docs/Cloudflare R2 File Manager SRS.md`. Code comments cite SRS requirement IDs (`AUTH-03`, `FILE-05`, `SHARE-04`, `MAIL-01`, `NFR-09`, …), and commit messages do too. Keep citing them when you implement or change a requirement.

The main app is deployed to **Dokploy (Docker) or Vercel, with Postgres**. It does not run on Cloudflare Workers or D1, even though the SRS assumes it does. `docs/project-structure.md` describes that deviation. Only `email-relay/` runs on Cloudflare.

## Commands

pnpm workspace (`frontend`, `server` = `@r2-manager/server`, `shared` = `@r2-manager/shared`, `email-relay`). Node >= 20.

```bash
pnpm install
pnpm dev                 # server on :8787 (tsx watch) + Vite on :5173; Vite proxies /api and /s to :8787
pnpm build               # shared typecheck -> frontend build -> server tsc
pnpm typecheck           # all packages
pnpm lint                # only frontend has an eslint script
pnpm test                # server vitest (runs once)

# single test file / single test
pnpm --filter server exec vitest run test/keys.test.ts
pnpm --filter server exec vitest run -t "rejects path traversal"

# database (Drizzle, Postgres from DATABASE_URL in .env)
pnpm db:generate         # after editing server/src/db/schema.ts -> writes server/src/db/migrations/
pnpm db:migrate

pnpm --filter server run hash-password 'pw'   # bcrypt hash for BASIC_AUTH_PASSWORD_HASH
pnpm --filter frontend format                 # prettier (no semicolons, double quotes, tailwind class sorting)
```

`server/src/config.ts` validates env with zod. The server **refuses to boot** unless `AUTH_MODE` is set and its matching vars are filled in: Access needs `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`, Basic needs `BASIC_AUTH_USERNAME`/`BASIC_AUTH_PASSWORD_HASH`. See `.env.example`.

## Architecture

### Request flow (server, Hono)

`server/src/app.ts` `createApp({ config, db?, storage? })` builds one runtime-agnostic Hono app. You can inject `db` and `storage` for tests. Two thin entry points wrap it:
- `entry/node.ts` is the Dokploy entry. It also serves `frontend/dist` with an SPA fallback.
- `entry/vercel.ts` is re-exported by `api/[[...route]].ts`. `vercel.json` rewrites `/api/*` and `/s/*` to this function.

The app has three separately authenticated route trees:
1. **`/api/v1/*`** is the management API. The chain is `accessJwt` → `basicAuth` → `authGate`. `authGate` combines the modes according to `AUTH_MODE`, then resolves the identity to an **active row in the `users` table**. It sets `c.var.user`, or returns 403 if there is no such user.
2. **`/s/:token`** is the public share gateway (`share-gateway/`). It has no management auth. It gets strict CSP, `noindex` and `no-store` headers, Postgres-backed rate limiting and a server-rendered password page. Share visitors never load the SPA.
3. **`/api/v1/internal/*`** covers `/cron`, protected by the `x-cron-secret` header, and `/mail-webhook`, which checks an HMAC in `x-webhook-signature` against `MAIL_WEBHOOK_SECRET`.

`config`, `db`, `storage`, `user` and `correlationId` are all available on `c.var` (types in `server/src/types.ts`).

### Layering conventions

- `routes/v1/*` is the thin HTTP layer. Each handler follows the same pattern: parse the body/query with a zod schema from `@r2-manager/shared`, then `assertBucketConfigured(config, bucket)`, then `requireCapability(db, user, capability, { bucket, key })`, then call the service, then `recordAudit(...)` for mutations.
- `services/authz.ts` `can`/`requireCapability` is **the only permission check** (AUTH-04). It combines role capabilities (`shared/src/roles.ts`) with per-user bucket/prefix `grants`. Admins bypass grants.
- `services/*` holds business logic with no HTTP.
- `storage/storage.ts` is the storage interface. `storage/r2-s3.ts` is the only implementation: R2 through its S3 API with `aws4fetch` and a server-held key.
- Errors: throw `AppError(code, message)` from `shared/src/errors.ts`. `app.onError` maps `AppError`, `ZodError` and `HTTPException` to `{ error: { code, message, details }, correlationId }`.

### Design constraints driven by serverless (Vercel limits)

- **Uploads skip the server.** The server creates the multipart upload, presigns part URLs, then completes or aborts it (`services/uploads.ts`, `routes/v1/uploads.ts`). The browser PUTs parts straight to R2 (`frontend/src/features/upload/multipart-client.ts`). Orphaned uploads are cleaned up by `jobs/upload-cleanup.ts` through `/internal/cron`.
- **Folder operations are cursor-batched.** `services/tree-ops.ts` `runTreeBatch` processes one page of keys per call and returns a cursor plus per-item results. It is not atomic across the tree. The client loops until the cursor is exhausted.
- **Rate limits and job state live in Postgres.** There is no Redis.
- Share download limits use a single conditional `UPDATE ... WHERE reserved < max_downloads RETURNING` so concurrent requests can't exceed the limit. Each share has a delivery mode: `stream` goes through the app, and `redirect` sends a short-lived presigned URL.
- `db/client.ts` and `loadConfig()` are module-level singletons. The DB pool size is 1 when `VERCEL` is set.

### Email ingestion

`email-relay/` is a Cloudflare Email Routing Worker. It writes the raw `.eml` to R2, then POSTs a signed JSON webhook. `server/src/mail/ingest.ts` verifies the webhook, fetches and parses the message with `postal-mime`, and applies `mail/rules.ts` (allowlists, size/type caps, Message-ID dedupe). It stores the attachments and indexes them in `mail_messages`/`mail_attachments`.

### Shared package

`shared/` is consumed as raw TypeScript source (`main: ./src/index.ts`) and has no build output. It holds the zod request/response schemas, key normalization (`keys.ts` rejects traversal, leading slashes, empty segments and backslashes), roles/capabilities and preview-type detection. Both the client and the server enforce these same rules. Server tests exercise `shared` directly.

### Frontend

Vite, React 19, TanStack Query and React Router, with Tailwind v4 and shadcn/ui. The shadcn style is `base-nova`, which is built on **`@base-ui/react`, not Radix**. The `@` alias points to `frontend/src`.
- `src/lib/api.ts` is a hand-written `fetch` wrapper (the `api` object plus `ApiError`), even though the structure doc mentions a Hono RPC client. Add new endpoints there.
- `src/pages/` holds route pages (browser, inbox, admin/*). Feature UI lives in `src/features/<feature>/`, and `src/components/ui/` is shadcn-generated.
- Project skills for UI work (`shadcn`, `better-ui`, `emil-design-eng`, `vercel-react-best-practices`) are in `.claude/skills/`.
