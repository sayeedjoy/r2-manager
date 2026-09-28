# Deploying to Vercel

**Status:** Draft, matches [project-structure.md](project-structure.md).

## Prerequisites

- A pooled Postgres connection string (Neon, Supabase's pooler, or PgBouncer) - Vercel functions are short-lived, so avoid a direct/unpooled connection.
- A Cloudflare R2 bucket and API token, same as the Dokploy path.

## 1. Import the repository

Import this repo into Vercel. [vercel.json](../vercel.json) points the build at the frontend and rewrites `/api/*` and `/s/*` to the serverless function defined in [api/[[...route]].ts](../api/%5B%5B...route%5D%5D.ts), which re-exports [server/src/entry/vercel.ts](../server/src/entry/vercel.ts).

## 2. Environment variables

Same variables as [.env.example](../.env.example) / [deploy-dokploy.md](deploy-dokploy.md), set in the Vercel project's Environment Variables panel. Use the **pooled** connection string for `DATABASE_URL`.
Set `TRUST_PROXY_HOPS=1`; Vercel must remain the only direct ingress so its forwarded client address is authoritative.

## 3. Migrations

Vercel does not run migrations as part of the build. Run them from your machine or CI against the same database before/after each deploy that changes the schema:

```bash
DATABASE_URL=<pooled-or-direct-url> pnpm --filter server db:migrate
```

(A direct, non-pooled URL is fine for running migrations even if the app uses a pooled one at runtime.)

## 4. Multipart uploads

Vercel's function request-body limit (~4.5 MB) is why uploads go straight from the browser to R2: the server only creates/signs/completes/aborts multipart sessions ([server/src/services/uploads.ts](../server/src/services/uploads.ts)); part bytes never pass through the Vercel function.

## 5. Background jobs

Add a Vercel Cron entry in `vercel.json` (or the dashboard) that POSTs to `/api/v1/internal/cron` with the `X-Cron-Secret` header set to `CRON_SECRET`, on whatever schedule you'd like upload-session cleanup to run.

## 6. Cloudflare Access

If you front the Vercel deployment with Cloudflare (e.g. via a CNAME proxied through Cloudflare) and enable Access, add a bypass policy for `/s/*`, or use a separate hostname for share links, so visitors without a management login can still redeem shares (SHARE-02/AUTH-05).

## 7. Email ingestion

Same as Dokploy: deploy [email-relay/](../email-relay/) separately with `wrangler deploy`, and point its `APP_WEBHOOK_URL` at `https://<your-vercel-domain>/api/v1/internal/mail-webhook`.
