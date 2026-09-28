# Deploying to Dokploy

**Status:** Draft, matches [project-structure.md](project-structure.md).

## Prerequisites

- A Dokploy instance with Docker.
- A Postgres database reachable from the app container (Dokploy's managed Postgres service, or your own).
- A Cloudflare R2 bucket and an R2 API token (Account -> R2 -> Manage API tokens) with read/write access scoped to that bucket.
- Optionally, a Cloudflare Access application in front of your app's hostname (AUTH-01), or plan to use Basic Authentication (AUTH-02).

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
| `AUTH_MODE` | `basic`, `access`, or `both` (AUTH-03: the app refuses to start without a valid mode) |
| `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD_HASH` | Required if `AUTH_MODE` includes `basic`. Generate the hash with `pnpm --filter server run hash-password '<password>'` |
| `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` | Required if `AUTH_MODE` includes `access` |
| `SESSION_SECRET` | 32+ random bytes |
| `APP_BASE_URL` | The public URL Dokploy will route to this app (used to build share links) |
| `TRUST_PROXY_HOPS` | Number of trusted reverse proxies that append or replace `X-Forwarded-For` (normally `1` for Dokploy) |

The application rejects non-HTTPS `APP_BASE_URL` and `R2_ENDPOINT` values in production. Ensure the Dokploy proxy replaces or appends `X-Forwarded-For`; do not pass an untrusted client value through unchanged.

## 4. Run migrations

After the first deploy, run migrations once (Dokploy's "run command" against the running container, or a one-off job):

```bash
node server/dist/db/migrate.js
```

(or `pnpm --filter server db:migrate` if running from a checkout with the same `DATABASE_URL`.)

## 5. Cloudflare Access (optional)

If the app's hostname is proxied through Cloudflare, add a Cloudflare Access application in front of it and set `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` accordingly. If Access protects the whole hostname, add a bypass policy for `/s/*` so share links keep working for visitors without a management login (SHARE-02/AUTH-05), or serve shares from a separate hostname that Access does not cover.

## 6. Email ingestion (optional, P1)

See [email-relay/](../email-relay/) - deploy that Worker separately with `wrangler deploy`, pointing `APP_WEBHOOK_URL` at `https://<your-app>/api/v1/internal/mail-webhook` and setting the same `MAIL_WEBHOOK_SECRET` on both sides.

## 7. Background jobs

Configure a Dokploy scheduled task (or any cron) to call:

```
POST https://<your-app>/api/v1/internal/cron
X-Cron-Secret: <CRON_SECRET>
```

on a periodic basis (e.g. every 15 minutes) to clean up expired multipart upload sessions.
