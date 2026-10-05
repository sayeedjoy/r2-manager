# Demo mode

`DEMO_MODE=true` turns the app into a public, read-only showcase. It's meant for a demo website only. Never set it on a deployment that manages real files.

What changes:

- **One shared demo account.** Visitors land on the sign-in page, which shows the demo email and password (`demo@example.com` / `r2-manager-demo`) and fills them in. No other account can sign in. Everyone who does is the same "Demo visitor" (an editor, so the upload, rename and share buttons stay visible to show what the app does).
- **No registration.** First-run setup, password reset, the account page and the admin area are all turned off, so nobody can create or change an account.
- **No real data.** Storage is a built-in set of sample files held in memory ([server/src/demo/fixtures.ts](../server/src/demo/fixtures.ts)): Markdown, PDF, CSV, JSON Lines, JSON, SVG, PNG, source code and 30 log files for pagination. They appear in one bucket, `demo-bucket`.
- **No database.** Postgres is never contacted. The Docker image skips migrations, `pnpm db:migrate` does nothing but say so, and `create-admin` refuses to run, even if a `DATABASE_URL` is still set.
- **Read-only.** The server refuses every non-GET API request except signing in and out with a 403 "read-only demo" message, and the demo storage throws on any write as a second line of defence. The share gateway (`/s/*`) and the cron trigger aren't mounted. Bulk "download as zip" is refused too, since it records an audit event.
- **Nothing real is loaded.** Demo mode overrides `DATABASE_URL`, the `R2_*` settings, `AUTH_MODE`, the Access settings, `SESSION_SECRET`, `SETUP_TOKEN` and `CRON_SECRET` with placeholders, so a value left over from a real `.env` is never read.

The frontend shows a "Read-only demo" banner, hides the account link, and sends `/setup`, `/forgot-password`, `/reset-password`, `/account` and `/admin/*` to the file browser (or to the sign-in page for a visitor who hasn't signed in).

The demo session is a plain cookie that lasts a day. Because the password is public, the cookie isn't a secret and protects nothing: the sign-in is there to show the screen, not to keep anyone out. That also means it needs no sessions table and keeps working across restarts.

## Running it

The only settings it needs are `DEMO_MODE` and `APP_BASE_URL` (plus `NODE_ENV`/`PORT` as usual):

```sh
# Docker (the same image as a normal deployment; it skips migrations when DEMO_MODE is on)
docker build -t r2-manager .
docker run --rm -p 8787:8787 \
  -e NODE_ENV=production -e DEMO_MODE=true -e APP_BASE_URL=https://demo.example.com \
  r2-manager

# Local development: add DEMO_MODE=true to .env, then
pnpm dev
```

On Dokploy, create the application as in [deploy-dokploy.md](deploy-dokploy.md), but skip the Postgres service, R2 CORS and cron steps, and set only the variables above.

## How it's wired

- [server/src/config.ts](../server/src/config.ts): `DEMO_MODE` sets `config.demo` and replaces the real-deployment settings.
- [server/src/app.ts](../server/src/app.ts): `createApp` mounts the demo chain instead of `accessJwt` → `authGate`, the auth routes, the share gateway and the cron trigger.
- [server/src/demo/routes.ts](../server/src/demo/routes.ts): the demo account (`DEMO_LOGIN`) and its `auth/status`, `auth/login` and `auth/logout` routes, the cookie check that replaces `authGate`, the read-only middleware, a stand-in database that throws if anything reaches for it, and stubs for `me`, `settings` and `shares`.
- [server/src/demo/storage.ts](../server/src/demo/storage.ts): `DemoStorage`, an in-memory `Storage` whose writes throw.
- [server/src/db/migrate.ts](../server/src/db/migrate.ts) and [server/src/scripts/create-admin.ts](../server/src/scripts/create-admin.ts): both check `DEMO_MODE` before opening a connection.
- [frontend/src/pages/auth/login.tsx](../frontend/src/pages/auth/login.tsx): shows and fills in `demoLogin` from `/api/v1/auth/status`.
- [frontend/src/components/demo.tsx](../frontend/src/components/demo.tsx): the banner and the route guard, driven by `demo: true` from `/api/v1/auth/status`.

If you add a route the SPA calls on load, give it a demo answer in `server/src/demo/routes.ts` or mount it in the demo branch of `createApp`. Otherwise demo visitors get a 404.
