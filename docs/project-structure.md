# Project Structure

**Status:** Proposed  
**Date:** 27 September 2026

This layout targets hosting on **Dokploy (Docker)** or **Vercel**, with **Postgres** configured through a `DATABASE_URL` connection string. It replaces the Cloudflare Worker + D1 architecture in SRS §3, §6 and §8. Only the Email Routing relay still runs on Cloudflare.

## Architecture changes from the SRS

| SRS assumption | Dokploy / Vercel design |
| --- | --- |
| R2 Worker bindings | R2 through its S3 API, with a scoped access key held only on the server (`aws4fetch`) |
| D1 | Postgres from `DATABASE_URL`, using Drizzle ORM with `postgres.js` |
| Worker `email()` handler | A small Cloudflare relay Worker saves the raw message to R2 and sends a signed webhook to the app |
| Upload parts go through the Worker | Browser uploads parts directly to R2 with short-lived presigned part URLs. The server creates, signs, completes and aborts the upload (Vercel's request body limit is about 4.5 MB) |
| Long folder operations in one request | Folder operations run in cursor-based batches: each call processes N keys and returns a cursor. This gives progress and cancellation (FILE-05) and stays within function time limits |
| Cloudflare Access | Supported when the domain is proxied through Cloudflare. The app's own email + password sign-in works on every platform |

Decisions:

- **Postgres only.** No D1 support, so there is one schema and one set of migrations. Cloudflare Workers hosting remains possible later through Hyperdrive.
- **Node runtime** for the server on both Dokploy and Vercel.
- **Rate limits and job state are stored in Postgres**, so neither platform needs Redis.

## Directory layout

```
r2-manager/
├── package.json                  # root scripts: dev, build, db:migrate, typecheck
├── pnpm-workspace.yaml           # frontend, server, shared, email-relay
├── .env.example                  # DATABASE_URL, R2_*, AUTH_*, MAIL_WEBHOOK_SECRET, CRON_SECRET
├── Dockerfile                    # Dokploy: Vite build + esbuild server bundle, slim runtime (no node_modules)
├── vercel.json                   # Vercel: static frontend, rewrites /api/* and /s/* to the function
├── api/
│   └── [[...route]].ts           # Vercel entry, re-exports server/src/entry/vercel.ts
├── docs/
│   ├── Cloudflare R2 File Manager SRS.md
│   ├── project-structure.md
│   ├── deploy-dokploy.md
│   └── deploy-vercel.md
│
├── shared/                       # used by both frontend and server
│   └── src/
│       ├── schemas/              # zod: listing, upload, share, metadata, settings
│       ├── keys.ts               # key normalization, path traversal rejection
│       ├── errors.ts             # error codes + { error, correlationId } shape
│       └── roles.ts              # Role enum and capability names
│
├── server/                       # runtime-agnostic Hono app
│   ├── drizzle.config.ts
│   ├── test/
│   └── src/
│       ├── app.ts                # createApp(): mounts routes, exports AppType
│       ├── config.ts             # zod-validated env; refuses to start if auth is unconfigured (AUTH-03)
│       ├── entry/
│       │   ├── node.ts           # @hono/node-server, serves frontend/dist, graceful shutdown
│       │   └── vercel.ts         # hono/vercel handle()
│       ├── db/
│       │   ├── client.ts         # postgres.js from DATABASE_URL (pool size depends on platform)
│       │   ├── schema.ts         # users, grants, shares, share_transfers, uploads,
│       │   │                     # mail_messages, mail_attachments, audit_events, rate_limits
│       │   └── migrations/       # drizzle-kit generated SQL
│       ├── storage/
│       │   ├── storage.ts        # interface: list, head, get(range), put, copy, delete,
│       │   │                     # multipart, presign
│       │   └── r2-s3.ts          # the one implementation, via the S3 API
│       ├── middleware/
│       │   ├── correlation-id.ts
│       │   ├── access-jwt.ts         # AUTH-01
│       │   ├── same-origin.ts        # CSRF guard for cookie-authenticated mutations
│       │   ├── auth-gate.ts          # AUTH-03: combine modes, deny if unconfigured
│       │   ├── rate-limit.ts         # Postgres-backed
│       │   └── security-headers.ts
│       ├── routes/v1/            # thin HTTP layer: parse, call service, respond
│       │   ├── buckets.ts
│       │   ├── objects.ts            # list, get (Range), rename, copy, move, delete
│       │   ├── folders.ts            # create, batched tree operations
│       │   ├── uploads.ts            # multipart create / sign parts / complete / abort
│       │   ├── metadata.ts
│       │   ├── shares.ts             # create, list, revoke (authenticated)
│       │   ├── mail.ts               # inbox, attachments, copy-to-folder
│       │   ├── admin.ts              # users, settings, audit, health
│       │   └── internal.ts           # cron trigger + mail webhook (secret / HMAC protected)
│       ├── share-gateway/        # /s/:token, its own middleware chain, no management auth
│       │   ├── routes.ts
│       │   └── password-page.tsx     # small server-rendered page (Hono JSX)
│       ├── mail/
│       │   ├── ingest.ts             # verify HMAC, fetch raw message from R2, parse, store attachments
│       │   └── rules.ts              # allowlists, size/type caps, dedupe by Message-ID
│       ├── jobs/                 # upload cleanup, retention, expired shares
│       │                         # (run by Vercel Cron or Dokploy schedule via /internal/cron)
│       └── services/             # business logic, no HTTP
│           ├── authz.ts              # can(user, action, bucket, key): the only permission check
│           ├── objects.ts
│           ├── tree-ops.ts           # copy-verify-delete, cursor batches, per-item results
│           ├── uploads.ts
│           ├── shares.ts             # token hashing, atomic reservation in Postgres
│           ├── audit.ts
│           └── crypto.ts             # password hashing, token generation
│
├── email-relay/                  # the only Cloudflare-hosted piece
│   ├── wrangler.jsonc            # R2 binding + email trigger
│   └── src/index.ts              # save raw message to R2 inbox/ prefix, POST signed webhook
│
└── frontend/                     # Vite + React + TypeScript + Tailwind + shadcn/ui
    └── src/
        ├── main.tsx
        ├── App.tsx               # router + app shell
        ├── pages/                # browser (/b/:bucket/*), inbox, shares, admin/*
        ├── features/
        │   ├── files/                # table/grid, breadcrumbs, context menu, dialogs
        │   ├── upload/               # queue store, multipart client, drop zone
        │   ├── preview/              # pdf, image, text, markdown, csv, jsonl
        │   ├── editor/
        │   ├── metadata/
        │   ├── shares/
        │   └── mail/
        ├── components/
        │   ├── ui/                   # shadcn
        │   └── layout/               # sidebar, header, theme toggle
        ├── hooks/
        └── lib/
            ├── api.ts                # Hono RPC client (hc<AppType>) + error handling
            └── utils.ts
```

## Design notes

- **`services/` is separate from `routes/`.** Every route calls `authz.can(...)` through a service, so all permission checks live in one testable place (AUTH-04).
- **The share gateway is isolated.** It has its own middleware chain (no management auth, strict CSP, `noindex`, `no-store`) and a server-rendered password page. Visitors never load the management SPA (SHARE-06).
- **`shared/` holds zod schemas and key normalization.** The client can reject bad paths or oversized files early, while the server still enforces the same rules. Response types come from Hono RPC (`AppType`).
- **Share download reservations (SHARE-04)** use a single `UPDATE shares SET reserved = reserved + 1 WHERE id = $1 AND reserved < max_downloads RETURNING ...`, which is safe under concurrency.
- **Share delivery mode** is set per share: stream through the app (strict, range-safe, revocable mid-download), or check the policy and then redirect to a presigned URL valid for about 60 seconds (cheaper on Vercel; allowed by SRS §4.5 when its limitations fit the policy).
- **Database connections:** on Vercel, use a pooled connection string (Neon, Supabase pooler or PgBouncer). On Dokploy, a direct `postgres://` URL to the Postgres service is fine.
- **Cloudflare Access with the share route:** if Access protects the whole hostname, add a bypass policy for `/s/*` or use a separate share hostname.

## Suggested libraries

| Area | Library |
| --- | --- |
| Server | Hono, `@hono/node-server`, zod, Drizzle ORM, `postgres`, `aws4fetch`, `postal-mime` |
| Frontend | TanStack Query, React Router or TanStack Router, `react-markdown` (no raw HTML), `@tanstack/react-virtual` |
| Testing | Vitest; Testcontainers or a disposable Postgres database for integration tests |
