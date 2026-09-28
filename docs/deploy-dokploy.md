# Deploying to Dokploy

This guide deploys r2-manager to [Dokploy](https://dokploy.com) as one Docker container, with Postgres as a Dokploy database service. The container serves the API, the public share gateway (`/s/*`) and the built frontend from a single Node process (see [project-structure.md](project-structure.md)).

**What you end up with:**

```
Browser ──HTTPS──▶ Traefik (Dokploy) ──▶ r2-manager container :8787 ──▶ Postgres (Dokploy service)
                                                    │
                                                    └──────────────▶ Cloudflare R2 (S3 API)
Browser ──PUT upload parts directly──────────────────────────────────▶ Cloudflare R2
```

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Configure CORS on the R2 bucket](#2-configure-cors-on-the-r2-bucket)
3. [Create the Postgres service](#3-create-the-postgres-service)
4. [Create the application](#4-create-the-application)
5. [Set environment variables](#5-set-environment-variables)
6. [Add a domain](#6-add-a-domain)
7. [Deploy and create the admin account](#7-deploy-and-create-the-admin-account)
8. [Schedule background jobs](#8-schedule-background-jobs)
9. [Optional: Cloudflare Access, email ingestion](#9-optional-cloudflare-access-and-email-ingestion)
10. [Updating, backups and recovery](#10-updating-backups-and-recovery)
11. [Troubleshooting](#11-troubleshooting)
12. [About the image](#12-about-the-image)

## 1. Prerequisites

- A Dokploy instance. The image is built on the Dokploy server, and the frontend build (TypeScript + Vite) needs about **2 GB of RAM**. On a 1 GB VPS, add swap or build elsewhere (see [Building on a small server](#building-on-a-small-server)).
- A domain or subdomain whose DNS `A` record points at the Dokploy server, e.g. `files.example.com`.
- A Cloudflare R2 bucket, plus an R2 API token with **Object Read & Write** on that bucket (Cloudflare dashboard → R2 → Manage R2 API Tokens). Note the **Account ID**, **Access Key ID** and **Secret Access Key**.
- The repository in a Git provider Dokploy can pull from (GitHub, GitLab, Bitbucket, Gitea or a plain Git URL).

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

`ExposeHeaders: ["ETag"]` is required. The client reads each part's ETag to complete the multipart upload. Repeat this for every bucket listed in `R2_BUCKETS`.

## 3. Create the Postgres service

1. In Dokploy, open (or create) a **Project** → **Create Service** → **Database** → **PostgreSQL**.
2. Pick a name (e.g. `r2manager-db`), a database name, a user and a strong password. Postgres 16 or 17 both work.
3. Click **Deploy**.
4. Open the database's **General** tab and copy the **Internal Connection URL**. It looks like:

   ```
   postgresql://r2manager:<password>@r2manager-db-abc123:5432/r2manager
   ```

   The host is the service's internal name on the Dokploy network, so the app can reach it without the database being exposed publicly. **Leave "External Port" empty.**

A direct (non-pooled) connection is right here. The app is one long-lived process with a pool of 10 connections.

## 4. Create the application

1. In the same project, click **Create Service** → **Application** and name it (e.g. `r2manager`).
2. **General** tab → **Provider**: connect your Git provider, then choose the repository and branch (e.g. `main`).
3. **Build Type**: choose **Dockerfile** (not Nixpacks or Buildpacks).
   - Dockerfile path: `Dockerfile`
   - Docker context path: `.`
   - Docker build stage: leave empty (the last stage, `runtime`, is the one you want).
4. Save. **Don't deploy yet**, because the app refuses to boot without its environment variables.

## 5. Set environment variables

Open the application's **Environment** tab and paste the following, filling in your values:

```dotenv
NODE_ENV=production
APP_BASE_URL=https://files.example.com
TRUST_PROXY_HOPS=1

DATABASE_URL=postgresql://r2manager:<password>@r2manager-db-abc123:5432/r2manager

R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 token access key id>
R2_SECRET_ACCESS_KEY=<r2 token secret>
R2_BUCKETS=my-bucket

AUTH_MODE=password
SESSION_SECRET=<openssl rand -hex 32>
SETUP_TOKEN=<openssl rand -hex 16>
CRON_SECRET=<openssl rand -hex 32>
```

Generate each secret with `openssl rand -hex 32` (or any 64-character random hex string).

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | Already `production` in the image. Keep it: production enforces HTTPS URLs and secure cookies. |
| `APP_BASE_URL` | yes | The public HTTPS URL from step 6. Used for share links, password-reset links and CORS. Must be `https://` in production. |
| `DATABASE_URL` | yes | Internal Connection URL from step 3. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | yes | From your R2 API token. |
| `R2_BUCKETS` | yes | Comma-separated bucket names this deployment may manage, e.g. `photos,backups`. |
| `R2_ENDPOINT` | no | Leave unset for R2. It defaults to `https://<account-id>.r2.cloudflarestorage.com`. Must be `https://` in production. |
| `AUTH_MODE` | yes | `password` (built-in email + password with optional 2FA), `access` (Cloudflare Access only) or `both` (AUTH-03). The app refuses to start without it. |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | if `access`/`both` | See [step 9](#9-optional-cloudflare-access-and-email-ingestion). |
| `SESSION_SECRET` | yes | 32+ characters. Signs cookies and **encrypts 2FA secrets and the SMTP password in the database**. Set it once and never change it: changing it breaks every user's 2FA and the saved SMTP password. |
| `SETUP_TOKEN` | recommended | 16+ characters. The first-run admin registration asks for it, so nobody who finds a fresh deployment first can claim the admin account. |
| `CRON_SECRET` | recommended | 32+ characters. Protects `/api/v1/internal/cron` ([step 8](#8-schedule-background-jobs)). |
| `MAIL_WEBHOOK_SECRET` | optional | 32+ characters. Only for email ingestion. |
| `TRUST_PROXY_HOPS` | yes | How many proxies append to `X-Forwarded-For`. It drives per-IP rate limiting on login and shares. **`1`** when browsers connect straight to Dokploy's Traefik (Cloudflare DNS-only / grey cloud). **`2`** when the domain is proxied through Cloudflare (orange cloud). |
| `SKIP_MIGRATIONS` | optional | Set to `1` to stop the container from running migrations on start ([step 10](#10-updating-backups-and-recovery)). |
| `PORT` | no | Defaults to `8787`. If you change it, change the domain's container port too. |

Outgoing email (password reset, invites) is **not** configured through env. You set it in the app under **Admin → Email delivery** after the first sign-in.

## 6. Add a domain

Application → **Domains** → **Add Domain**:

- **Host:** `files.example.com`
- **Path:** `/`
- **Container Port:** `8787`
- **HTTPS:** on, **Certificate Provider:** Let's Encrypt

If the DNS record is proxied through Cloudflare (orange cloud), set Cloudflare SSL/TLS mode to **Full (strict)** and use `TRUST_PROXY_HOPS=2`.

## 7. Deploy and create the admin account

1. Click **Deploy** and watch the **Deployments** log. The first build takes a few minutes, and later builds reuse cached dependency layers.
2. When the container starts, its **Logs** tab shows:

   ```
   Migrations applied.
   r2-manager listening on http://localhost:8787
   ```

   Database migrations run automatically on every start. Already-applied migrations are skipped.
3. Open `https://files.example.com`. On first run the app shows a registration screen for the administrator. Enter the `SETUP_TOKEN` if you set one. Once an admin exists the screen closes for good. In `access` mode the Access email is used instead of a password.
4. Go to **Admin → Email delivery** and configure SMTP, so password resets and invites work.

## 8. Schedule background jobs

A periodic job cleans up abandoned multipart uploads, expired sessions and old password-reset links. Nothing runs it automatically. It needs a scheduled request to `POST /api/v1/internal/cron` with the `X-Cron-Secret` header.

**With Dokploy's scheduler (recommended):** Application → **Schedules** → **Add Schedule**:

- **Name:** `r2-manager cron`
- **Cron expression:** `*/15 * * * *`
- **Shell:** `sh`
- **Command:**

  ```sh
  wget -q -O - --post-data="" --header="X-Cron-Secret: $CRON_SECRET" http://127.0.0.1:8787/api/v1/internal/cron
  ```

The command runs inside the app container, where `CRON_SECRET` is already in the environment. A successful run prints something like `{"ok":true,"expiredUploads":0,...}`.

**From any external scheduler:**

```sh
curl -fsS -X POST -H "X-Cron-Secret: <CRON_SECRET>" https://files.example.com/api/v1/internal/cron
```

## 9. Optional: Cloudflare Access and email ingestion

**Cloudflare Access (AUTH-01).** This needs the domain proxied through Cloudflare (orange cloud, so `TRUST_PROXY_HOPS=2`).

1. Zero Trust → Access → Applications → add a self-hosted app for `files.example.com`.
2. Copy its **Application Audience (AUD) tag** into `ACCESS_AUD`, and set `ACCESS_TEAM_DOMAIN` to `https://<team>.cloudflareaccess.com`.
3. Set `AUTH_MODE=access` or `both`.
4. Add a **Bypass** policy for the path `/s/*`, or share links will demand an Access login from visitors (SHARE-02/AUTH-05). Alternatively, serve shares from a second hostname that Access doesn't cover.

**Email ingestion (MAIL-01, optional).** Deploy [email-relay/](../email-relay/) to Cloudflare separately with `wrangler deploy`. Point its `APP_WEBHOOK_URL` at `https://files.example.com/api/v1/internal/mail-webhook` and give it the same `MAIL_WEBHOOK_SECRET` as the app.

## 10. Updating, backups and recovery

**Updating.** Push to the tracked branch and click **Deploy**, or turn on **Autodeploy** / the Git webhook in the application's General tab. New migrations apply on container start.

- Keep the application at **1 replica**. Migrations run at startup and aren't coordinated across replicas.
- To run migrations yourself instead, set `SKIP_MIGRATIONS=1`. Then, before or after each deploy, run this from the application's **Terminal** tab (or `docker exec`):

  ```sh
  node dist/migrate.mjs
  ```

**Backups.** Everything the app owns lives in Postgres: users, grants, shares, audit log and settings. Enable **Backups** on the Dokploy Postgres service (it can push to S3-compatible storage, including an R2 bucket). The files themselves live in R2. Back up the environment variables too, especially `SESSION_SECRET`.

**Locked out of the admin account.** Open the application's **Terminal** tab (the shell is `sh`) and run:

```sh
node dist/create-admin.mjs admin@example.com "Admin" --reset-2fa
```

It prompts for a new password (or reads `ADMIN_PASSWORD` from the environment), promotes the account to an active admin, and signs it out everywhere. Drop `--reset-2fa` to keep the account's 2FA.

**Rolling back.** Open the application's **Deployments** list and redeploy an earlier commit. Migrations are forward-only: if a release added one, the older code runs against the newer schema, so restore a database backup if that is a problem.

## 11. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Container restarts; log shows `Invalid server configuration:` followed by a list | A required variable is missing or invalid, and the list names it. Common cases: `APP_BASE_URL` isn't `https://`, `SESSION_SECRET` is shorter than 32 characters, or `AUTH_MODE` is unset. |
| Log shows `DATABASE_URL is required to run migrations`, or `ECONNREFUSED`/`ENOTFOUND` | `DATABASE_URL` is missing or uses the wrong host. Use the database's **Internal** Connection URL, and make sure the database and the app are in the same Dokploy project/network. |
| `Bad Gateway` / `404 page not found` from Traefik | The domain's container port isn't `8787`, or the container is still starting. Check the Logs tab. |
| Uploads fail in the browser with a CORS error | The R2 bucket's CORS policy is missing, or doesn't list your exact origin or expose `ETag` ([step 2](#2-configure-cors-on-the-r2-bucket)). |
| Everyone shares one login rate limit, or it trips too easily | `TRUST_PROXY_HOPS` doesn't match your proxy chain. Use `2` behind Cloudflare's orange cloud and `1` otherwise. |
| Share links ask for a Cloudflare Access login | Add the `/s/*` bypass policy ([step 9](#9-optional-cloudflare-access-and-email-ingestion)). |
| 2FA codes or the saved SMTP password stopped working after a redeploy | `SESSION_SECRET` changed. Restore the old value. |
| Build is killed (`exit code 137`) during `vite build` or `tsc` | The server ran out of memory. Add swap, or see below. |

### Building on a small server

To keep builds off the Dokploy host, build and push the image from CI (e.g. GitHub Actions) to a registry:

```sh
docker build -t ghcr.io/<you>/r2-manager:latest .
docker push ghcr.io/<you>/r2-manager:latest
```

Then in Dokploy choose **Provider → Docker**, enter the image name and registry credentials, and redeploy to pull new versions. Everything else in this guide stays the same.

## 12. About the image

The [Dockerfile](../Dockerfile) is a two-stage build.

1. **build** (`node:24-alpine`): installs only the `frontend` and `server` workspaces. `email-relay`'s Wrangler/workerd toolchain is skipped. It then builds the SPA with Vite and bundles the server with esbuild ([server/bundle.mjs](../server/bundle.mjs)). The bundle inlines `@r2-manager/shared` and every npm dependency into three self-contained files: `server.mjs`, `migrate.mjs` and `create-admin.mjs`.
2. **runtime** (`node:24-alpine`): copies only those bundles, `frontend/dist` and the SQL migrations. That's roughly 10 MB on top of the Node base image: no `node_modules`, no pnpm, no source.

Other properties:

- It runs as the unprivileged `node` user.
- A Docker `HEALTHCHECK` polls `GET /healthz`, which checks neither the DB nor auth, so Dokploy and Swarm can see when the container is up.
- The start command `exec`s Node, so SIGTERM from a stop or redeploy reaches Node directly and it closes the HTTP server and DB pool cleanly.
- Source maps are included and enabled (`NODE_OPTIONS=--enable-source-maps`), so stack traces in the logs point at the original TypeScript files.

Build and run it locally the same way Dokploy does:

```sh
docker build -t r2-manager .
docker run --rm -p 8787:8787 --env-file .env -e NODE_ENV=production r2-manager
```

Inside a container, `localhost` in `DATABASE_URL` means the container itself. For the dev Postgres from `pnpm services:up`, use `host.docker.internal:5433` instead, or add `--network r2-manager_default` and use `postgres:5432`.
