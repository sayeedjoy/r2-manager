# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-hosted file manager for Cloudflare R2 buckets. It covers browsing, multipart uploads, previews, an in-browser editor and protected share links. Requirements live in `docs/Cloudflare R2 File Manager SRS.md`. Code comments cite SRS requirement IDs (`AUTH-03`, `FILE-05`, `SHARE-04`, `NFR-09`, …), and commit messages do too. Keep citing them when you implement or change a requirement.

The main app is deployed to **Dokploy (Docker) or Vercel, with Postgres**. It does not run on Cloudflare Workers or D1, even though the SRS assumes it does. `docs/project-structure.md` describes that deviation.

## Commands

pnpm workspace (`frontend`, `server` = `@r2-manager/server`, `shared` = `@r2-manager/shared`). Node >= 20.

```bash
pnpm install
pnpm services:up         # docker compose: Postgres (host port 5433) + SeaweedFS S3 on :8333; see docs/local-development.md
pnpm services:down
pnpm dev                 # server on :8787 (tsx watch) + Vite on :5173; Vite proxies /api and /s/ to :8787
pnpm build               # shared typecheck -> frontend build -> server tsc
pnpm typecheck           # all packages
pnpm lint                # only frontend has an eslint script
pnpm test                # server and frontend Vitest suites (run once)

# single test file / single test
pnpm --filter server exec vitest run test/keys.test.ts
pnpm --filter server exec vitest run -t "rejects path traversal"
pnpm --filter frontend test

# database (Drizzle, Postgres from DATABASE_URL in .env)
pnpm db:generate         # after editing server/src/db/schema.ts -> writes server/src/db/migrations/
pnpm db:migrate

pnpm --filter server run create-admin <email> [name] [--reset-2fa]   # recovery only; first-run setup happens in the browser
pnpm --filter frontend format                 # prettier (no semicolons, double quotes, tailwind class sorting)
```

`server/src/config.ts` validates env with zod. The server **refuses to boot** unless `AUTH_MODE` (`password` | `access` | `both`) is set and its matching vars are filled in: Access needs `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`. `SESSION_SECRET` also keys the AES-GCM encryption of TOTP secrets and the SMTP password in Postgres. See `.env.example`.

## Architecture

### Request flow (server, Hono)

`server/src/app.ts` `createApp({ config, db?, storage? })` builds one runtime-agnostic Hono app. You can inject `db` and `storage` for tests. Two thin entry points wrap it:
- `entry/node.ts` is the Dokploy entry. It also serves `frontend/dist` with an SPA fallback and a DB-free `/healthz`. The Docker image does not run the `tsc` output (extensionless ESM imports, raw-TS `shared`). Instead `pnpm --filter server bundle` (`server/bundle.mjs`, esbuild) emits self-contained `dist/bundle/{server,migrate,create-admin}.mjs`, and the runtime stage ships only those, `frontend/dist` and the migrations. The container runs migrations on start unless `SKIP_MIGRATIONS=1`. Deploy guide: `docs/deploy-dokploy.md`.
- `entry/vercel.ts` is re-exported by `api/[[...route]].ts`. `vercel.json` rewrites `/api/*` and `/s/*` to this function.

The app has three separately authenticated route trees:
1. **`/api/v1/*`** is the management API. The chain is `accessJwt` → `authGate`. `authGate` combines the Access JWT and the password-session cookie (`services/sessions.ts`, hashed tokens in the `sessions` table) according to `AUTH_MODE`, then resolves the identity (a lowercased email) to an **active row in the `users` table**. It sets `c.var.user` and `c.var.sessionId`, or returns 401/403.
   - **`/api/v1/auth/*`** (`routes/v1/auth.ts`) sits outside the gate: status, first-run `setup` (open until an admin exists, then closed for good through an `app_settings` flag), `login` + `login/verify` (TOTP or recovery code; a 2FA account first gets an `mfaPending` session), `logout`, `password/forgot` and `password/reset`. `/api/v1/account/*` holds the signed-in user's password, 2FA and sessions.
   - `sameOriginMutations` refuses cross-site mutations on `/api/*`. The session cookie is also `SameSite=Strict`.
2. **`/s/:token`** is the public share gateway (`share-gateway/`). It has no management auth. It gets strict CSP, `noindex` and `no-store` headers, Postgres-backed rate limiting and a server-rendered password page. Share visitors never load the SPA.
3. **`/api/v1/internal/*`** covers `/cron`, protected by the `x-cron-secret` header.

**`DEMO_MODE=true`** (`config.demo`) is for the public demo site only. `createApp` swaps all of the above for `server/src/demo/`: a fixed demo visitor with no sign-in, `DemoStorage` (in-memory sample files, writes throw), no Postgres (a stand-in `db` throws if touched), 403 on every non-GET, and only the buckets/objects/metadata routes plus stubs for `auth/status`, `me`, `settings` and `shares`. A new route the SPA needs on load must be handled there too. See `docs/demo-mode.md`.

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
- **Rate limits and job state live in Postgres.** There is no Redis. Login, 2FA, setup and reset endpoints count failures per IP and per email or user.
- **SMTP settings live in `app_settings`** (key `smtp`) and are edited at Admin > Email delivery, not in env. `services/mailer.ts` sends with nodemailer.
- Share download limits use a single conditional `UPDATE ... WHERE reserved < max_downloads RETURNING` so concurrent requests can't exceed the limit. Each share has a delivery mode: `stream` goes through the app, and `redirect` sends a short-lived presigned URL.
- `db/client.ts` and `loadConfig()` are module-level singletons. The DB pool size is 1 when `VERCEL` is set.

### Shared package

`shared/` is consumed as raw TypeScript source (`main: ./src/index.ts`) and has no build output. It holds the zod request/response schemas, key normalization (`keys.ts` rejects traversal, leading slashes, empty segments and backslashes), roles/capabilities and preview-type detection. Both the client and the server enforce these same rules. Server tests exercise `shared` directly.

### Frontend

Vite, React 19, TanStack Query and React Router, with Tailwind v4 and shadcn/ui. The shadcn style is `base-nova`, which is built on **`@base-ui/react`, not Radix**. The `@` alias points to `frontend/src`.
- `src/lib/api.ts` is a hand-written `fetch` wrapper (the `api` object plus `ApiError`), even though the structure doc mentions a Hono RPC client. Add new endpoints there.
- `src/pages/` holds route pages (browser, admin/*). Feature UI lives in `src/features/<feature>/`, and `src/components/ui/` is shadcn-generated.
- Project skills for UI work (`shadcn`, `better-ui`, `emil-design-eng`, `vercel-react-best-practices`) are in `.claude/skills/`.
