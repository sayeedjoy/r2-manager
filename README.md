<p align="center">
  <img src="frontend/public/r2-manager-logo.webp" alt="R2 Manager" width="300" />
</p>

<h3 align="center">A self-hosted file manager for your Cloudflare R2 buckets</h3>

<p align="center">
  Browse, upload, preview, edit and share files in R2 from a clean web UI.<br />
  You own the server, the database and the keys.
</p>

<p align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="Hono" src="https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16%20%7C%2017-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" />
  <img alt="Cloudflare R2" src="https://img.shields.io/badge/Cloudflare-R2-F38020?logo=cloudflare&logoColor=white" />
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#self-hosting">Self-hosting</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#operations">Operations</a> ·
  <a href="#local-development">Development</a>
</p>

---

## Features

| | |
| --- | --- |
| **Browse** | List and grid views, name filter, folders, multiple buckets per deployment |
| **Upload** | Drag-and-drop files *or whole folders* (hierarchy preserved). Multipart uploads go **straight from the browser to R2**, so file size is not limited by your server |
| **Preview** | Images (with gallery navigation), PDF, Markdown, CSV, JSON, JSONL and plain text |
| **Edit** | In-browser editor for text, Markdown, CSV and JSON, with ETag conflict detection so two people can't silently overwrite each other |
| **Bulk actions** | Move, copy, delete and download-as-zip for many files or entire folders, plus a metadata editor |
| **Share links** | Public links with optional password, expiry and download limit, and a revoke button. Stream through the app or hand out short-lived presigned URLs |
| **Email inbox** | Optional: mail sent to an address you choose drops its attachments into a bucket, with size caps and de-duplication |
| **Sign-in** | Email + password with optional TOTP 2FA and recovery codes, password reset by email, session management. Or put it behind **Cloudflare Access**, or use both |
| **Roles** | `admin`, `editor` and `viewer`, plus per-user grants scoped to a bucket or a folder prefix |
| **Audit trail** | Every change is logged. The admin area also covers users, grants, SMTP settings and health |
| **Hardened by default** | Brute-force limits on login/2FA/reset, same-origin checks on every mutation, strict CSP on share pages, secrets encrypted at rest |

---

## How it works

```
                        ┌───────────────────────────────────────────┐
Browser ──HTTPS──▶ proxy ──▶  R2 Manager (one Node process)          │
   │                    │     • React SPA          • /api/v1 (Hono)  │──▶ PostgreSQL
   │                    │     • /s/:token public share pages         │    users, shares, audit, settings
   │                    └──────────────────────┬────────────────────┘
   │                                           │ S3 API (server-held key)
   │                                           ▼
   └──── upload parts, PUT via presigned URLs ──▶  Cloudflare R2
```

- **Your files stay in R2.** The app only holds metadata in Postgres: users, grants, share links, the audit log and settings.
- **Uploads skip the server.** The server starts a multipart upload and signs part URLs, then the browser sends the bytes directly to R2. A small VPS or a serverless function can handle multi-GB files.
- **No Redis, no queue.** Rate limits and job state live in Postgres. The only moving parts are the app and the database.

---

## Self-hosting

### What you need

- A **Cloudflare account** with R2 enabled (the free tier is enough to start).
- **One** of these:
  - any Linux server with Docker (building the image needs about **2 GB of RAM**),
  - a [Dokploy](https://dokploy.com) instance, or
  - a [Vercel](https://vercel.com) account plus a hosted Postgres (Neon or Supabase).
- A domain or subdomain for the app, e.g. `files.example.com`. HTTPS is required in production.

### Pick a path

| Path | Best for | Guide |
| --- | --- | --- |
| **A. Docker Compose on any server** | A VPS or home server you control. Includes Postgres and automatic HTTPS | [below](#option-a-docker-compose-on-any-server) |
| **B. Dokploy** | You already run Dokploy, or want a UI for deploys, backups and schedules | [docs/deploy-dokploy.md](docs/deploy-dokploy.md) |
| **C. Vercel** | Serverless, no server to maintain | [docs/deploy-vercel.md](docs/deploy-vercel.md) |
| **D. `docker run`** | You already have Postgres and a reverse proxy | [below](#option-d-docker-run-with-your-own-postgres) |

All four start with the same R2 setup.

### Step 1: Prepare Cloudflare R2

1. **Create a bucket.** Cloudflare dashboard → **R2** → **Create bucket**, e.g. `my-files`.
2. **Create an API token.** R2 → **Manage R2 API Tokens** → **Create API token** with **Object Read & Write**, scoped to your bucket(s). Write down:
   - **Account ID** (also shown on the R2 overview page)
   - **Access Key ID**
   - **Secret Access Key**
3. **Allow browser uploads (CORS).** Open the bucket → **Settings** → **CORS Policy** → **Add CORS policy**, and use your app's URL:

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

   > [!IMPORTANT]
   > `ExposeHeaders: ["ETag"]` is required. Without it, every upload fails when the browser tries to complete it. Repeat this for every bucket you add to `R2_BUCKETS`.

---

### Option A: Docker Compose on any server

This runs three containers: the app, Postgres, and [Caddy](https://caddyserver.com), which gets and renews a Let's Encrypt certificate automatically.

**1. Point your domain at the server.** Create a DNS `A` record for `files.example.com` → your server's IP. Open ports **80** and **443** in the firewall.

**2. Clone the repository.**

```bash
git clone https://github.com/sayeedjoy/r2-manager.git /opt/r2-manager
cd /opt/r2-manager
```

**3. Create `docker-compose.prod.yml`** in the repo root:

```yaml
name: r2-manager-prod

services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://r2manager:${POSTGRES_PASSWORD}@postgres:5432/r2manager
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: r2manager
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: r2manager
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U r2manager -d r2manager"]
      interval: 5s
      timeout: 5s
      retries: 10

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - app

volumes:
  postgres-data:
  caddy-data:
  caddy-config:
```

**4. Create a `Caddyfile`** next to it:

```caddy
files.example.com {
	reverse_proxy app:8787
}
```

**5. Create `.env`** with your values. Generate every secret with `openssl rand -hex 32`:

```dotenv
APP_BASE_URL=https://files.example.com
TRUST_PROXY_HOPS=1

# Used by docker-compose.prod.yml to build DATABASE_URL. Use hex so it's URL-safe.
POSTGRES_PASSWORD=<openssl rand -hex 24>

R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key id>
R2_SECRET_ACCESS_KEY=<r2 secret access key>
R2_BUCKETS=my-files

AUTH_MODE=password
SESSION_SECRET=<openssl rand -hex 32>
SETUP_TOKEN=<openssl rand -hex 16>
CRON_SECRET=<openssl rand -hex 32>
```

```bash
chmod 600 .env
```

**6. Build and start it.**

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f app
```

Wait for these two lines. Database migrations run automatically on every start.

```
Migrations applied.
r2-manager listening on http://localhost:8787
```

**7. Schedule the cleanup job.** Add this line to the host's crontab (`crontab -e`). It removes abandoned uploads, expired sessions and old reset links every 15 minutes:

```cron
*/15 * * * * cd /opt/r2-manager && docker compose -f docker-compose.prod.yml exec -T app sh -c 'wget -q -O /dev/null --post-data="" --header="X-Cron-Secret: $CRON_SECRET" http://127.0.0.1:8787/api/v1/internal/cron'
```

Then continue with [First run](#first-run).

> [!TIP]
> Building needs about 2 GB of RAM. On a 1 GB VPS, [add swap](https://www.digitalocean.com/community/tutorials/how-to-add-swap-space-on-ubuntu-22-04), or build the image elsewhere, push it to a registry, and replace `build: .` with `image: ghcr.io/<you>/r2-manager:latest`.

> [!NOTE]
> If the domain is proxied through Cloudflare (orange cloud), set SSL/TLS mode to **Full (strict)** and use `TRUST_PROXY_HOPS=2`.

---

### Option B: Dokploy

Follow **[docs/deploy-dokploy.md](docs/deploy-dokploy.md)**. It walks through the Postgres service, the Dockerfile app, environment variables, the domain, the built-in scheduler and backups.

### Option C: Vercel

Follow **[docs/deploy-vercel.md](docs/deploy-vercel.md)**. The SPA is served from Vercel's CDN and the API runs as one Node function. You'll need a **pooled** Postgres URL (Neon or Supabase session mode), and you run migrations from your machine.

### Option D: `docker run` with your own Postgres

If you already have Postgres 16+ and a reverse proxy that terminates TLS:

```bash
docker build -t r2-manager .
docker run -d --name r2-manager --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  -e DATABASE_URL='postgres://user:pass@db-host:5432/r2manager' \
  r2-manager
```

Point your proxy at `127.0.0.1:8787`. `GET /healthz` returns 200 once the process is up, and it doesn't touch the database. Set `TRUST_PROXY_HOPS` to the number of proxies in front of the app.

---

### First run

1. Open `https://files.example.com`. You'll see a **create administrator** screen.
2. Enter your name, email, a password and the `SETUP_TOKEN` from your `.env`. After the first admin exists, this screen is gone for good.
3. Go to **Admin → Email delivery** and add SMTP settings (Gmail with an app password, Brevo, Postmark, SES and so on). Click **Send test email**. Password resets and invites depend on it.
4. Turn on **2FA** under your account, then invite teammates from **Admin → Users** and give them roles and grants.

> [!WARNING]
> Set `SETUP_TOKEN`. Without it, whoever opens a fresh deployment first can claim the admin account.

---

## Configuration

Every setting is an environment variable. The server validates them on start and **refuses to boot** with a clear list of what's wrong. Outgoing email is the one exception: you configure SMTP in the app (**Admin → Email delivery**), not in env.

| Variable | Required | Description |
| --- | :---: | --- |
| `APP_BASE_URL` | Yes | Public URL of the app, e.g. `https://files.example.com`. Used for share links, reset emails and CORS. Must be `https://` in production. |
| `DATABASE_URL` | Yes | Postgres connection string. Option A sets it for you. |
| `R2_ACCOUNT_ID` | Yes | Your Cloudflare account ID. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Yes | R2 API token credentials. |
| `R2_BUCKETS` | Yes | Comma-separated buckets this deployment may manage, e.g. `photos,backups`. |
| `R2_ENDPOINT` | | Override the S3 endpoint. Defaults to `https://<account-id>.r2.cloudflarestorage.com`. |
| `AUTH_MODE` | Yes | `password` (built-in sign-in + optional 2FA), `access` (Cloudflare Access only) or `both`. |
| `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` | if `access`/`both` | `https://<team>.cloudflareaccess.com` and the Access application's AUD tag. |
| `SESSION_SECRET` | Yes | 32+ characters. Signs cookies and **encrypts 2FA secrets and the SMTP password**. Set it once and never change it. |
| `SETUP_TOKEN` | recommended | 16+ characters. Required to register the first admin. |
| `CRON_SECRET` | recommended | 32+ characters. Protects the cleanup endpoint. |
| `MAIL_WEBHOOK_SECRET` | | 32+ characters. Only needed for [email ingestion](#optional-email-ingestion). |
| `TRUST_PROXY_HOPS` | | Proxies in front of the app, used for per-IP rate limits. `1` behind one proxy (default), `2` behind Cloudflare orange cloud + your proxy. |
| `PORT` | | Listen port. Defaults to `8787`. |
| `SKIP_MIGRATIONS` | | `1` stops the container from running migrations on start. |
| `NODE_ENV` | | The Docker image already sets `production`. Don't set it on Vercel. |

See [.env.example](.env.example) for a commented template.

---

## Operations

### Updating

```bash
cd /opt/r2-manager
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

New migrations apply when the container starts. Run **one** app replica, because startup migrations aren't coordinated across replicas.

### Backups

Postgres holds everything the app owns: users, grants, shares, the audit log and settings. Your files live in R2.

```bash
# back up
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U r2manager r2manager | gzip > r2manager-$(date +%F).sql.gz

# restore into an empty database
gunzip -c r2manager-2026-01-01.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U r2manager r2manager
```

Keep a copy of `.env` somewhere safe too, **especially `SESSION_SECRET`**. Without it, saved 2FA secrets and the SMTP password can't be decrypted.

### Locked out?

Reset or create an admin from the server. The command prompts for a new password and signs the account out everywhere:

```bash
docker compose -f docker-compose.prod.yml exec app \
  node dist/create-admin.mjs you@example.com "Your Name" --reset-2fa
```

Leave out `--reset-2fa` to keep the account's authenticator. On Vercel, run `pnpm --filter server run create-admin …` from your machine with `DATABASE_URL` set.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| Container restarts with `Invalid server configuration:` | The list under it names the bad variable. Usual causes: `APP_BASE_URL` isn't `https://`, `SESSION_SECRET` is under 32 characters, or `AUTH_MODE` is missing. |
| Uploads fail with a CORS error | The bucket's CORS policy doesn't list your exact origin or doesn't expose `ETag` ([step 1](#step-1-prepare-cloudflare-r2)). |
| Caddy can't get a certificate | DNS doesn't point at the server yet, or ports 80/443 are blocked. Check with `docker compose -f docker-compose.prod.yml logs caddy`. |
| Login rate limit trips for everyone | `TRUST_PROXY_HOPS` doesn't match your proxy chain. |
| 2FA codes or SMTP stopped working after a redeploy | `SESSION_SECRET` changed. Restore the old value. |
| Build killed with `exit code 137` | Out of memory during the build. Add swap or build elsewhere. |
| Share links ask for a Cloudflare Access login | Add an Access **Bypass** policy for `/s/*`. |

The [Dokploy](docs/deploy-dokploy.md#11-troubleshooting) and [Vercel](docs/deploy-vercel.md#12-troubleshooting) guides have longer lists.

---

## Optional: Cloudflare Access

To put the whole app behind Cloudflare Zero Trust:

1. Proxy the domain through Cloudflare (orange cloud) and set `TRUST_PROXY_HOPS=2`.
2. **Zero Trust → Access → Applications** → add a self-hosted app for `files.example.com`.
3. Set `ACCESS_AUD` to its **Application Audience (AUD) tag**, set `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`, and set `AUTH_MODE=access` (Access only) or `both` (Access **and** an app password).
4. Add a **Bypass** policy for the path `/s/*`, so public share links still work for visitors.

The app verifies the Access JWT itself. Bypassing Cloudflare doesn't bypass the check.

## Optional: Email ingestion

Send or forward mail to an address like `inbox@example.com`, and its attachments land in your bucket and show up in the app's **Inbox**.

This part runs on Cloudflare as a small Email Routing Worker ([email-relay/](email-relay/)). It stores the raw message in R2 and notifies the app through a signed webhook.

1. In [email-relay/wrangler.jsonc](email-relay/wrangler.jsonc), set your bucket name and `APP_WEBHOOK_URL=https://files.example.com/api/v1/internal/mail-webhook`.
2. Set `MAIL_WEBHOOK_SECRET` (32+ characters) in the app's `.env` and restart it. Give the Worker the same value:

   ```bash
   pnpm install
   pnpm --filter email-relay exec wrangler secret put MAIL_WEBHOOK_SECRET
   pnpm --filter email-relay exec wrangler deploy
   ```

3. In Cloudflare **Email Routing**, route an address to the `r2-manager-email-relay` Worker.

By default any sender is accepted, messages are capped at 25 MB and attachments at 20 MB, and a repeated Message-ID is ignored. The defaults live in [server/src/mail/rules.ts](server/src/mail/rules.ts).

---

## Local development

Requires Node 20+, pnpm and Docker. Docker Compose provides Postgres and [SeaweedFS](https://github.com/seaweedfs/seaweedfs) as an S3-compatible stand-in for R2, so you don't need a Cloudflare account to hack on it.

```bash
pnpm install
cp .env.example .env   # fill in the values from docs/local-development.md
pnpm services:up       # Postgres on :5433, SeaweedFS S3 on :8333
pnpm db:migrate
pnpm dev               # API on :8787, Vite on :5173
```

Open <http://localhost:5173> and register the admin account. See [docs/local-development.md](docs/local-development.md) for the exact `.env` values and tips.

| Command | What it does |
| --- | --- |
| `pnpm dev` | API (tsx watch) + frontend (Vite) with hot reload |
| `pnpm build` | Typecheck `shared`, build the frontend, compile the server |
| `pnpm test` | Server and frontend Vitest suites |
| `pnpm typecheck` / `pnpm lint` | Type and lint checks |
| `pnpm db:generate` | Create a migration after editing `server/src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm services:up` / `services:down` | Start/stop the dev Postgres + SeaweedFS |

### Tech stack

- **Frontend:** React 19, Vite, TanStack Query, React Router, Tailwind CSS v4, shadcn/ui (Base UI)
- **Server:** Hono on Node, Drizzle ORM + PostgreSQL, `aws4fetch` for the R2 S3 API, nodemailer, zod
- **Email relay:** Cloudflare Worker + Email Routing, `postal-mime`

### Project layout

```
r2-manager/
├── frontend/      React SPA (pages, feature modules, shadcn/ui components)
├── server/        Hono API, share gateway, jobs, Drizzle schema + migrations
│   └── src/entry/ node.ts (Docker/Dokploy) and vercel.ts entry points
├── shared/        zod schemas, key validation, roles: used by client and server
├── email-relay/   Cloudflare Email Routing Worker
├── api/           Vercel function shim
├── docs/          Deployment and development guides
├── Dockerfile     Two-stage image: esbuild bundle + static SPA, no node_modules at runtime
└── docker-compose.yml   Dev-only Postgres + SeaweedFS
```

---

## Contributing

Issues and pull requests are welcome. Before you open a PR:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

If you change the database schema, commit the generated migration from `pnpm db:generate` along with it.

## Security

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/sayeedjoy/r2-manager/security/advisories/new) rather than in a public issue.

<p align="center">
  <sub>Built for people who'd rather own their file manager than rent one.</sub>
</p>
