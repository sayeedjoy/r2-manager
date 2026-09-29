# Deploying to Vercel

This guide deploys r2-manager to [Vercel](https://vercel.com) with a hosted Postgres. Vercel serves the built frontend from its CDN. One Node.js serverless function handles the API (`/api/*`) and the public share gateway (`/s/*`) (see [project-structure.md](project-structure.md)).

**What you end up with:**

```
Browser ──HTTPS──▶ Vercel CDN ──▶ frontend/dist (static SPA)
                       │
                       └── /api/*, /s/* ──▶ Vercel Function (Node) ──▶ Postgres (pooled)
                                                    │
                                                    └──────────────▶ Cloudflare R2 (S3 API)
Browser ──PUT upload parts directly──────────────────────────────────▶ Cloudflare R2
```

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Configure CORS on the R2 bucket](#2-configure-cors-on-the-r2-bucket)
3. [Create the database](#3-create-the-database)
4. [Import the project](#4-import-the-project)
5. [Set environment variables](#5-set-environment-variables)
6. [Run migrations](#6-run-migrations)
7. [Add a domain and create the admin account](#7-add-a-domain-and-create-the-admin-account)
8. [Schedule background jobs](#8-schedule-background-jobs)
9. [Serverless limits to know about](#9-serverless-limits-to-know-about)
10. [Optional: Cloudflare Access, email ingestion](#10-optional-cloudflare-access-and-email-ingestion)
11. [Updating, previews, backups and recovery](#11-updating-previews-backups-and-recovery)
12. [Troubleshooting](#12-troubleshooting)

## 1. Prerequisites

- A Vercel account, and the repository on GitHub, GitLab or Bitbucket.
- A Cloudflare R2 bucket, plus an R2 API token with **Object Read & Write** on that bucket (Cloudflare dashboard → R2 → Manage R2 API Tokens). Note the **Account ID**, **Access Key ID** and **Secret Access Key**.
- Node.js 20+ and pnpm on your machine. You run migrations and account recovery from there, not on Vercel.

## 2. Configure CORS on the R2 bucket

Uploads skip the server: the browser `PUT`s each part straight to R2 through presigned URLs. So the bucket has to allow your app's origin, or every upload fails with a CORS error.

Cloudflare dashboard → R2 → your bucket → **Settings** → **CORS Policy** → **Add CORS policy**:

```json
[
  {
    "AllowedOrigins": ["https://files.example.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

List every origin people will use: your custom domain and, if you use it, `https://<project>.vercel.app`. `ExposeHeaders: ["ETag"]` is required, because the client reads each part's ETag to complete the multipart upload. Repeat this for every bucket listed in `R2_BUCKETS`.

## 3. Create the database

Vercel functions are short-lived, and many instances can run at once, so the app needs a **pooled** connection string. The pool size is 1 per function instance when `VERCEL` is set ([server/src/db/client.ts](../server/src/db/client.ts)).

**Neon (recommended).** In the Vercel project go to **Storage** → **Create Database** → **Neon**, or create a project at neon.tech. The Vercel integration fills in `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` for you. Otherwise, copy the connection string with **Connection pooling** turned on: its host contains `-pooler`.

**Supabase.** Use the pooler's **session mode** connection string (port `5432` on the `pooler.supabase.com` host). Don't use transaction mode (port `6543`). It doesn't support prepared statements, and the app's Postgres driver uses them, so queries fail with `prepared statement "…" does not exist`.

**Pick a region close to R2 and your users**, and set the Vercel function region to match ([step 9](#9-serverless-limits-to-know-about)). Every API request makes several database round trips.

## 4. Import the project

1. Vercel dashboard → **Add New…** → **Project** → import the repository.
2. **Framework Preset:** `Other`. **Root Directory:** leave as the repository root.
3. Leave **Build**, **Output** and **Install** commands alone. [vercel.json](../vercel.json) sets them:
   - install: `pnpm install --frozen-lockfile`
   - build: `pnpm build` (typechecks `shared`, builds the SPA, typechecks the server)
   - output: `frontend/dist`
   - rewrites: `/api/*` and `/s/*` go to the function in [api/[[...route]].ts](../api/%5B%5B...route%5D%5D.ts), which re-exports [server/src/entry/vercel.ts](../server/src/entry/vercel.ts)
4. Expand **Environment Variables** and add everything from [step 5](#5-set-environment-variables) before you click **Deploy**. Vercel deploys as soon as you import. Without the variables the function refuses to boot, and every `/api` request returns 500.
5. After import, go to **Settings → General → Node.js Version** and pick `22.x` or `24.x`.

## 5. Set environment variables

Add these under **Settings → Environment Variables**. Scope them to **Production** only; see [Preview deployments](#preview-deployments) for why.

```dotenv
APP_BASE_URL=https://files.example.com
TRUST_PROXY_HOPS=1

DATABASE_URL=postgresql://<user>:<password>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=require

R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 token access key id>
R2_SECRET_ACCESS_KEY=<r2 token secret>
R2_BUCKETS=my-bucket

AUTH_MODE=password
SESSION_SECRET=<openssl rand -hex 32>
SETUP_TOKEN=<openssl rand -hex 16>
CRON_SECRET=<openssl rand -hex 32>

ENABLE_EXPERIMENTAL_COREPACK=1
```

Generate each secret with `openssl rand -hex 32` (or any 64-character random hex string). The variables mean the same thing as in the [Dokploy guide](deploy-dokploy.md#5-set-environment-variables). The differences on Vercel:

| Variable | Notes on Vercel |
| --- | --- |
| `NODE_ENV` | **Don't set it.** Vercel already runs functions with `NODE_ENV=production`, which turns on HTTPS-only URLs and secure cookies. If you set it yourself, it also applies to the build, and then `pnpm install` skips devDependencies (Vite, TypeScript) and the build fails. |
| `APP_BASE_URL` | The public HTTPS URL people use (your custom domain, or `https://<project>.vercel.app` until you add one). Share links and password-reset emails use it. |
| `DATABASE_URL` | The **pooled** URL from [step 3](#3-create-the-database). |
| `TRUST_PROXY_HOPS` | **`1`.** Vercel replaces `X-Forwarded-For` with the connecting client's address, so the last entry is always the one to trust. Vercel must be the only way in. |
| `SETUP_TOKEN` | Strongly recommended. The deployment is public the moment it builds, and the first person to open it can register the admin account unless this is set. |
| `CRON_SECRET` | Needed for [step 8](#8-schedule-background-jobs). |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` makes Vercel use the pnpm version pinned in the root `package.json` (`packageManager`) instead of guessing one from the lockfile. |
| `AUTH_MODE`, `ACCESS_*`, `SESSION_SECRET`, `MAIL_WEBHOOK_SECRET`, `R2_*` | Same as Dokploy. `SESSION_SECRET` encrypts 2FA secrets and the SMTP password in the database. Set it once and never change it. |

`PORT` and `SKIP_MIGRATIONS` do nothing on Vercel. Outgoing email (password reset, invites) is **not** set through env. You configure it in the app under **Admin → Email delivery**.

Changes to environment variables only apply to **new** deployments. After editing one, redeploy (Deployments → ⋯ → **Redeploy**).

## 6. Run migrations

Vercel doesn't run migrations. Run them from your machine (or CI) against the production database before the first sign-in, and again before or after every deploy that adds a migration under [server/src/db/migrations/](../server/src/db/migrations/).

Use the **direct (unpooled)** URL for this if you have one, e.g. Neon's `DATABASE_URL_UNPOOLED`. The pooled URL works too.

```bash
# bash / zsh
DATABASE_URL='<direct-url>' pnpm db:migrate
```

```powershell
# PowerShell
$env:DATABASE_URL = '<direct-url>'; pnpm db:migrate; Remove-Item Env:DATABASE_URL
```

It prints `Migrations applied.` Migrations that have already run are skipped, so running it again is safe. A `DATABASE_URL` set on the command line wins over the one in your local `.env`.

## 7. Add a domain and create the admin account

1. **Settings → Domains** → add `files.example.com` and create the DNS record Vercel shows you. Then update `APP_BASE_URL` and the R2 CORS origins to match, and redeploy.
2. Open the site. On first run it shows a registration screen for the administrator. Enter the `SETUP_TOKEN` if you set one. Once an admin exists, the screen closes for good. In `access` mode the Access email is used instead of a password.
3. Go to **Admin → Email delivery** and configure SMTP (port 465 or 587), so password resets and invites work.

## 8. Schedule background jobs

A periodic job cleans up abandoned multipart uploads, expired sessions and old password-reset links. It runs when something sends `POST /api/v1/internal/cron` with an `X-Cron-Secret` header.

**Vercel Cron can't trigger it as the code stands.** Vercel Cron only sends `GET` requests, and it puts the secret in `Authorization: Bearer …`, while this endpoint takes `POST` and `X-Cron-Secret`. Use an external scheduler instead.

**GitHub Actions** (free, in the same repository). Add a repository secret `CRON_SECRET` with the same value, then commit `.github/workflows/cron.yml`:

```yaml
name: r2-manager cron
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:
jobs:
  cron:
    runs-on: ubuntu-latest
    steps:
      - run: >
          curl -fsS -X POST
          -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}"
          https://files.example.com/api/v1/internal/cron
```

GitHub runs scheduled workflows on a best-effort basis, often a few minutes late. That's fine for cleanup. It also disables schedules in a public repository after 60 days without activity.

**Any other scheduler** works the same way: cron-job.org, a Cloudflare Worker Cron Trigger, or a server's crontab.

```sh
curl -fsS -X POST -H "X-Cron-Secret: <CRON_SECRET>" https://files.example.com/api/v1/internal/cron
```

A successful run returns `{"ok":true,"expiredUploads":0,...}`.

## 9. Serverless limits to know about

- **Uploads** are fine at any size. Vercel caps function request bodies at about 4.5 MB, which is why part bytes go straight from the browser to R2. The function only creates, signs, completes and aborts multipart sessions ([server/src/services/uploads.ts](../server/src/services/uploads.ts)).
- **Downloads, previews, editor loads and `stream`-mode shares** pass through the function (`storage.get` → response body). Large files count against the function's duration and data transfer, so test with your biggest files. For large public shares, choose the **`redirect`** delivery mode: the visitor gets a short-lived presigned R2 URL, and the bytes never touch Vercel.
- **Folder operations** (move, copy, delete a tree) run in cursor batches, one page of keys per request ([server/src/services/tree-ops.ts](../server/src/services/tree-ops.ts)), so a big folder doesn't hit the function timeout.
- **Function region.** Put the function near the database: **Settings → Functions → Function Region**, or add `"regions": ["fra1"]` (for example) to `vercel.json`. The default region (`iad1`, Washington D.C.) adds latency to every request if your database is elsewhere.
- **Rate limits and job state** live in Postgres, so they hold across function instances. Nothing depends on memory surviving between requests.

## 10. Optional: Cloudflare Access and email ingestion

**Cloudflare Access (AUTH-01).** Access only works on a hostname proxied through Cloudflare. Point `files.example.com` at Vercel with a proxied (orange-cloud) `CNAME` to `cname.vercel-dns.com`, and set Cloudflare SSL/TLS mode to **Full (strict)**.

1. Zero Trust → Access → Applications → add a self-hosted app for `files.example.com`.
2. Copy its **Application Audience (AUD) tag** into `ACCESS_AUD`, and set `ACCESS_TEAM_DOMAIN` to `https://<team>.cloudflareaccess.com`.
3. Set `AUTH_MODE=access` or `both`, and redeploy.
4. Add a **Bypass** policy for the path `/s/*`, or share links will demand an Access login from visitors (SHARE-02/AUTH-05). Alternatively, serve shares from a second hostname that Access doesn't cover.

The app verifies the Access JWT itself, so the `*.vercel.app` URL is not a way around Access. Keep `TRUST_PROXY_HOPS=1`. Behind the orange cloud, the address Vercel reports is a Cloudflare edge address, not the visitor's, so per-IP rate limits on login and shares get coarser. Per-account limits are unaffected.

**Email ingestion (MAIL-01, optional).** Deploy [email-relay/](../email-relay/) to Cloudflare separately:

1. In [email-relay/wrangler.jsonc](../email-relay/wrangler.jsonc), set the bucket name and `APP_WEBHOOK_URL` to `https://files.example.com/api/v1/internal/mail-webhook`.
2. Add `MAIL_WEBHOOK_SECRET` (32+ characters) to the Vercel project and redeploy. Then give the Worker the same value with `pnpm --filter email-relay exec wrangler secret put MAIL_WEBHOOK_SECRET`.
3. Deploy the Worker with `pnpm --filter email-relay exec wrangler deploy`, then route an address to it under Cloudflare **Email Routing**.

## 11. Updating, previews, backups and recovery

**Updating.** Every push to the production branch (usually `main`) deploys automatically. If the release adds a migration, run [step 6](#6-run-migrations) right before or after the push. New code expects the new schema, so the gap should be short.

### Preview deployments

Vercel builds a preview for every other branch and pull request. If the production variables apply to previews too, a preview runs against your **production database and buckets**, and its share links point at `APP_BASE_URL`. So choose one:

- **Production-only variables (simplest).** The preview frontend builds, but its `/api` returns 500 because the configuration is missing.
- **A separate Preview environment.** Scope a second set of variables to **Preview**, with their own `DATABASE_URL` (a Neon branch works well), a test bucket, and different secrets.

Leave **Deployment Protection** (Vercel Authentication) on for previews.

**Backups.** Everything the app owns lives in Postgres: users, grants, shares, audit log and settings. Use your provider's backups (Neon keeps point-in-time history, and Supabase has daily backups). The files themselves live in R2. Keep a copy of the environment variables too, especially `SESSION_SECRET`.

**Locked out of the admin account.** Run this from your machine against the production database:

```bash
DATABASE_URL='<direct-url>' pnpm --filter server run create-admin admin@example.com "Admin" --reset-2fa
```

It prompts for a new password (or reads `ADMIN_PASSWORD` from the environment), promotes the account to an active admin, and signs it out everywhere. Drop `--reset-2fa` to keep the account's 2FA.

**Rolling back.** Deployments → pick an earlier production deployment → **Instant Rollback**. Migrations are forward-only: if a release added one, the older code runs against the newer schema, so restore a database backup if that's a problem.

## 12. Troubleshooting

Function errors show up under the project's **Logs** tab (or Deployments → a deployment → **Functions**).

| Symptom | Cause / fix |
| --- | --- |
| Build fails with `vite: not found` / `tsc: not found` | `NODE_ENV=production` is set in the project's variables, so devDependencies weren't installed. Remove it. |
| Build fails during `pnpm install` with a lockfile or pnpm version error | Set `ENABLE_EXPERIMENTAL_COREPACK=1` so the pinned pnpm version is used, then redeploy. |
| Every `/api` request returns 500; logs show `Invalid server configuration:` and a list | A required variable is missing or invalid, and the list names it. Common cases: `APP_BASE_URL` isn't `https://`, `SESSION_SECRET` is shorter than 32 characters, or `AUTH_MODE` is unset. Redeploy after fixing it. |
| A variable change has no effect | Variables apply only to new deployments. Redeploy. |
| `relation "…" does not exist` | Migrations haven't run against this database ([step 6](#6-run-migrations)). |
| `prepared statement "…" does not exist` | `DATABASE_URL` uses a transaction-mode pooler such as Supabase's port `6543`. Use Neon's pooled URL or Supabase's session-mode pooler ([step 3](#3-create-the-database)). |
| `too many connections` / `remaining connection slots are reserved` | `DATABASE_URL` is a direct connection. Switch to the pooled one. |
| Uploads fail in the browser with a CORS error | The R2 bucket's CORS policy is missing, or doesn't list the exact origin you're on (custom domain vs `*.vercel.app`) or doesn't expose `ETag` ([step 2](#2-configure-cors-on-the-r2-bucket)). |
| Large downloads or `stream` shares time out or cut off | They pass through the function. Use `redirect` delivery for large shares ([step 9](#9-serverless-limits-to-know-about)). |
| Share links ask for a Cloudflare Access login | Add the `/s/*` bypass policy ([step 10](#10-optional-cloudflare-access-and-email-ingestion)). |
| 2FA codes or the saved SMTP password stopped working | `SESSION_SECRET` changed. Restore the old value. |
| Cron requests return 401 | The scheduler's `X-Cron-Secret` doesn't match `CRON_SECRET`, or `CRON_SECRET` isn't set on Vercel. |
