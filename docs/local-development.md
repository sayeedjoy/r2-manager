# Local development

[docker-compose.yml](../docker-compose.yml) runs the app's dependencies:

| Service | Purpose | Host port |
| --- | --- | --- |
| `postgres` | App database | 5432 (`POSTGRES_PORT`) |
| `minio` | S3-compatible stand-in for R2 | 9000 API (`MINIO_API_PORT`), 9001 console (`MINIO_CONSOLE_PORT`) |
| `minio-init` | One-shot: creates the `r2-manager-dev` bucket | none |

The app runs on your machine with `pnpm dev`, so you keep hot reload. The server talks to MinIO through the same S3 API it uses for R2 in production.

## First run

1. Start the services. This waits until Postgres and MinIO are healthy, then creates the bucket:

   ```bash
   pnpm services:up
   ```

2. Generate a password hash for Basic Authentication:

   ```bash
   pnpm --filter server run hash-password 'choose-a-password'
   ```

3. Put these values in the repo-root `.env`. Leave any other keys blank.

   ```dotenv
   DATABASE_URL=postgres://r2manager:r2manager@localhost:5432/r2manager

   R2_ACCOUNT_ID=local
   R2_ACCESS_KEY_ID=r2manager
   R2_SECRET_ACCESS_KEY=r2manager-secret
   R2_BUCKETS=r2-manager-dev
   R2_ENDPOINT=http://localhost:9000

   AUTH_MODE=basic
   BASIC_AUTH_USERNAME=admin
   BASIC_AUTH_PASSWORD_HASH=<output of step 2>
   SESSION_SECRET=<any random string, 16+ characters>

   APP_BASE_URL=http://localhost:5173
   PORT=8787
   ```

   `APP_BASE_URL` points at the Vite dev server because it proxies `/api` and `/s` to the API on port 8787. Share links it generates therefore open through Vite.

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
pnpm services:up     # start Postgres + MinIO
pnpm dev             # API on :8787, frontend on :5173
pnpm services:down   # stop them; data is kept in Docker volumes
```

To start from empty, run `docker compose down -v`. It deletes the database and every stored object.

The MinIO console at http://localhost:9001 (user `r2manager`, password `r2manager-secret`) shows the objects the app writes.

## Differences from R2

- **CORS.** Browsers upload multipart parts straight to the storage endpoint. MinIO allows any origin by default, so this works locally without setup. A real R2 bucket needs a CORS rule that allows `PUT` from `APP_BASE_URL` and exposes the `ETag` header, or uploads fail at the first part.
- **Region.** The app signs requests for region `auto`, as R2 expects. The compose file sets MinIO's region to `auto` to match.
- **Email ingestion.** The `email-relay` Worker needs Cloudflare Email Routing, so it has no local equivalent. You can still test ingestion by uploading a raw `.eml` to MinIO and sending a signed POST to `/api/v1/internal/mail-webhook` yourself (see `server/src/mail/ingest.ts`).
