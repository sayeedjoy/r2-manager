# Local development

[docker-compose.yml](../docker-compose.yml) runs the app's dependencies:

| Service | Purpose | Host port |
| --- | --- | --- |
| `postgres` | App database | 5433 (`POSTGRES_PORT`) |
| `seaweedfs` | S3-compatible stand-in for R2 | 8333 S3 API (`S3_PORT`), 8888 filer web UI (`FILER_PORT`) |
| `seaweedfs-init` | One-shot: creates the `r2-manager-dev` bucket | none |

The app runs on your machine with `pnpm dev`, so you keep hot reload. The server talks to SeaweedFS through the same S3 API it uses for R2 in production.

Postgres uses host port 5433, not 5432, so it doesn't collide with a Postgres already installed on your machine. If 5432 is taken, connections to `localhost:5432` go to the local install instead of the container and fail with an authentication error.

The storage is SeaweedFS rather than MinIO because MinIO stopped publishing community images, so `minio/minio` and `minio/mc` can no longer be pulled.

## First run

1. Start the services. This waits until Postgres and SeaweedFS are healthy, then creates the bucket:

   ```bash
   pnpm services:up
   ```

2. Put these values in the repo-root `.env`. Leave any other keys blank.

   ```dotenv
   DATABASE_URL=postgres://r2manager:r2manager@localhost:5433/r2manager

   R2_ACCOUNT_ID=local
   R2_ACCESS_KEY_ID=r2manager
   R2_SECRET_ACCESS_KEY=r2manager-secret
   R2_BUCKETS=r2-manager-dev
   R2_ENDPOINT=http://localhost:8333

   AUTH_MODE=password
   SESSION_SECRET=<32+ random characters, e.g. openssl rand -hex 32>

   APP_BASE_URL=http://localhost:5173
   PORT=8787
   ```

   `APP_BASE_URL` points at the Vite dev server because it proxies `/api` and `/s/` to the API on port 8787. Share links it generates therefore open through Vite.

3. Create the tables:

   ```bash
   pnpm db:migrate
   ```

4. Start the app and open http://localhost:5173. On the first run it asks you to register the admin account (name, email, password). After that it shows the sign-in page.

   ```bash
   pnpm dev
   ```

5. Optional: to try password reset emails and invites, set up SMTP under Admin > Email delivery (Gmail with an app password, or Brevo with an SMTP key) and use "Send test email".

## Day to day

```bash
pnpm services:up     # start Postgres + SeaweedFS
pnpm dev             # API on :8787, frontend on :5173
pnpm services:down   # stop them; data is kept in Docker volumes
```

To start from empty, run `docker compose down -v`. It deletes the database and every stored object.

The filer UI at http://localhost:8888 shows what the app has stored under `/buckets/r2-manager-dev`.

After 10 failed sign-ins for one email (or 20 from one address) within 15 minutes, the API refuses sign-in for that email or address until the window passes, even with the right password.

Locked out of the only admin account with no email set up? Reset it from a shell with database access: `pnpm --filter server run create-admin you@example.com` (add `--reset-2fa` if the authenticator is lost too).

## Differences from R2

- **CORS.** Browsers upload multipart parts straight to the storage endpoint. SeaweedFS allows any origin and exposes the `ETag` header by default, so this works locally without setup. A real R2 bucket needs a CORS rule that allows `PUT` from `APP_BASE_URL` and exposes `ETag`, or uploads fail at the first part.
- **Credentials.** SeaweedFS reads its S3 access key from [docker/seaweedfs/s3.json](../docker/seaweedfs/s3.json). They're dev-only values; change both that file and `.env` if you want different ones.
- **Email ingestion.** The `email-relay` Worker needs Cloudflare Email Routing, so it has no local equivalent. You can still test ingestion by putting a raw `.eml` in the bucket with any S3 client and sending a signed POST to `/api/v1/internal/mail-webhook` yourself (see `server/src/mail/ingest.ts`).
