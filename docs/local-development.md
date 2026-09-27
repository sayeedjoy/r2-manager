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

2. Generate a password hash for Basic Authentication:

   ```bash
   pnpm --filter server run hash-password 'choose-a-password'
   ```

3. Put these values in the repo-root `.env`. Leave any other keys blank.

   ```dotenv
   DATABASE_URL=postgres://r2manager:r2manager@localhost:5433/r2manager

   R2_ACCOUNT_ID=local
   R2_ACCESS_KEY_ID=r2manager
   R2_SECRET_ACCESS_KEY=r2manager-secret
   R2_BUCKETS=r2-manager-dev
   R2_ENDPOINT=http://localhost:8333

   AUTH_MODE=basic
   BASIC_AUTH_USERNAME=admin
   BASIC_AUTH_PASSWORD_HASH=<output of step 2>
   SESSION_SECRET=<any random string, 16+ characters>

   APP_BASE_URL=http://localhost:5173
   PORT=8787
   ```

   `APP_BASE_URL` points at the Vite dev server because it proxies `/api` and `/s/` to the API on port 8787. Share links it generates therefore open through Vite.

4. Create the tables, then create the first admin. Only identities with an active `users` row can sign in, and with no argument the script uses `BASIC_AUTH_USERNAME`:

   ```bash
   pnpm db:migrate
   pnpm --filter server run create-admin
   ```

5. Start the app and open http://localhost:5173. The browser asks for the Basic Authentication username and password.

   ```bash
   pnpm dev
   ```

## Day to day

```bash
pnpm services:up     # start Postgres + SeaweedFS
pnpm dev             # API on :8787, frontend on :5173
pnpm services:down   # stop them; data is kept in Docker volumes
```

To start from empty, run `docker compose down -v`. It deletes the database and every stored object.

The filer UI at http://localhost:8888 shows what the app has stored under `/buckets/r2-manager-dev`.

After 10 failed Basic Authentication attempts within a minute, the API refuses logins for the rest of that minute, even with the right password. If you mistype your password during setup, wait a minute before trying again.

## Differences from R2

- **CORS.** Browsers upload multipart parts straight to the storage endpoint. SeaweedFS allows any origin and exposes the `ETag` header by default, so this works locally without setup. A real R2 bucket needs a CORS rule that allows `PUT` from `APP_BASE_URL` and exposes `ETag`, or uploads fail at the first part.
- **Credentials.** SeaweedFS reads its S3 access key from [docker/seaweedfs/s3.json](../docker/seaweedfs/s3.json). They're dev-only values; change both that file and `.env` if you want different ones.
- **Email ingestion.** The `email-relay` Worker needs Cloudflare Email Routing, so it has no local equivalent. You can still test ingestion by putting a raw `.eml` in the bucket with any S3 client and sending a signed POST to `/api/v1/internal/mail-webhook` yourself (see `server/src/mail/ingest.ts`).
