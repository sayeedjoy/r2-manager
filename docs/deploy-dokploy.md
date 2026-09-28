# Deploying to Dokploy

**Status:** Draft, matches [project-structure.md](project-structure.md).

## Prerequisites

- A Dokploy instance with Docker.
- A Postgres database reachable from the app container (Dokploy's managed Postgres service, or your own).
- A Cloudflare R2 bucket and an R2 API token (Account -> R2 -> Manage API tokens) with read/write access scoped to that bucket.
- Optionally, a Cloudflare Access application in front of your app's hostname (AUTH-01). Without it, the app's own email + password sign-in (AUTH-02) is used.

## 1. Create the Postgres service

In Dokploy, add a Postgres service and note its internal connection string, e.g.:

```
postgres://r2manager:<password>@r2manager-db:5432/r2manager
```

A direct (non-pooled) connection string is fine here since Dokploy runs a long-lived Node process (project-structure.md).

## 2. Build the app

Dokploy builds the repository's [Dockerfile](../Dockerfile), which produces a single image running the Node entry point ([server/src/entry/node.ts](../server/src/entry/node.ts)) serving both the API and the built frontend.

## 3. Configure environment variables

Set the variables from [.env.example](../.env.example) in Dokploy's environment panel. At minimum:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | The Postgres connection string from step 1 |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | From your R2 API token |
| `R2_BUCKETS` | Comma-separated bucket names this deployment manages |
| `AUTH_MODE` | `password`, `access`, or `both` (AUTH-03: the app refuses to start without a valid mode) |
| `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` | Required if `AUTH_MODE` includes `access` |
| `SESSION_SECRET` | 32+ random bytes. Also encrypts 2FA secrets and the SMTP password in the database, so keep it stable |
| `SETUP_TOKEN` | Optional, 16+ characters. When set, first-run admin registration asks for it |
| `APP_BASE_URL` | The public URL Dokploy will route to this app (used to build share links) |
| `TRUST_PROXY_HOPS` | Number of trusted reverse proxies that append or replace `X-Forwarded-For` (normally `1` for Dokploy) |

The application rejects non-HTTPS `APP_BASE_URL` and `R2_ENDPOINT` values in production. Ensure the Dokploy proxy replaces or appends `X-Forwarded-For`; do not pass an untrusted client value through unchanged.

## 4. Run migrations

After the first deploy, run migrations once (Dokploy's "run command" against the running container, or a one-off job):

```bash
node server/dist/db/migrate.js
```

(or `pnpm --filter server db:migrate` if running from a checkout with the same `DATABASE_URL`.)

## 5. Create the admin account

Open the app. On the first run it shows a registration screen for the administrator (in `access` mode, the Access email is used). It closes for good once an admin exists. Then set up outgoing email under Admin > Email delivery so password reset and invites work.

Upgrading from `AUTH_MODE=basic`: switch to `password`, run the migrations, and register the admin on the first-run screen. The old Basic Auth user row stays but can't sign in; disable it under Admin > Users.

## 6. Cloudflare Access (optional)

If the app's hostname is proxied through Cloudflare, add a Cloudflare Access application in front of it and set `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` accordingly. If Access protects the whole hostname, add a bypass policy for `/s/*` so share links keep working for visitors without a management login (SHARE-02/AUTH-05), or serve shares from a separate hostname that Access does not cover.

## 7. Email ingestion (optional, P1)

See [email-relay/](../email-relay/) - deploy that Worker separately with `wrangler deploy`, pointing `APP_WEBHOOK_URL` at `https://<your-app>/api/v1/internal/mail-webhook` and setting the same `MAIL_WEBHOOK_SECRET` on both sides.

## 8. Background jobs

Configure a Dokploy scheduled task (or any cron) to call:

```
POST https://<your-app>/api/v1/internal/cron
X-Cron-Secret: <CRON_SECRET>
```

on a periodic basis (e.g. every 15 minutes) to clean up expired multipart upload sessions, sign-in sessions and password reset links.
