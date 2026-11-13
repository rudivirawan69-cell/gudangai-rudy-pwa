# GudangAI RUDY — Cloudflare Worker + Supabase

## Production target (single canonical domain)

- **PWA assets and Agent API:** https://gudangai-rudy-pwa-69.rudivirawan69.workers.dev/
- Worker: `gudangai-rudy-pwa-69`
- Entrypoint: `worker.js`
- Supabase project: `https://cbeosysruwkfwgklziog.supabase.co`

This is the only production hostname for the PWA assets and Agent API. The existing general stock/transaction module in `src/data/api.js` still calls the Apps Script Web App directly to preserve its current write contract; it has not yet been migrated to a Worker write proxy. Do not describe the Worker as the current transaction writer. Do not use legacy Worker hostnames (`gudangai-rudy-pwa6`, `gudangai-rudy`, `gudangai-rudy-pwa69`), Pages `*.pages.dev`, Vercel, or GitHub Pages as production targets.

## Deployment

The only production deployment workflow is `.github/workflows/webpack.yml`.

- Pull requests run validation and build only.
- A push to `main` runs verification, production build, Wrangler dry-run, Worker/assets deployment, runtime secret setup, live health check, and CORS check.
- Manual deployment: GitHub Actions → **GudangAI RUDY CI and Cloudflare Production Deploy** → Run workflow on `main`.

No other workflow should deploy the PWA to Pages or another hostname.

## Authentication

The PWA sends the Supabase session access token as `Authorization: Bearer <access_token>`.
The Worker verifies it against `/auth/v1/user` using the project's publishable API key.
Protected routes include `/api/agent`, `/api/claude`, and `/api/data`. The PWA Agent currently uses `/api/agent`; `/api/data` is the authenticated read-only Sheets bridge. The general PWA stock/transaction API remains on the configured Apps Script Web App until a separate write-proxy migration is implemented and tested.
Never put a Supabase service-role/secret key in browser code or any `VITE_*` variable.

## GitHub Environment secrets

Configure these under Settings → Environments → `production`:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`)
- `GUDANGAI_SHEETS_API_SECRET`

Cloudflare token must be valid for the matching account and authorized to edit/deploy Workers. Never paste secret values into source code or chat.

## Worker runtime configuration

Encrypted Worker secrets managed by the deployment workflow:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (value sourced from the project's publishable key)
- `GUDANGAI_SHEETS_API_SECRET`

Non-secret vars and bindings:
- `GUDANGAI_SHEETS_API_URL`
- `AI_MODEL`
- `ANTHROPIC_FALLBACK_ENABLED`
- `SUPABASE_PUBLISHABLE_KEY`
- `ALLOWED_ORIGINS`
- Workers AI binding `AI`

## Endpoints

- `GET /api/agent/health` — public health/configuration status
- `POST /api/agent` — authenticated read-only Agent
- `POST /api/claude` — compatibility alias, authenticated
- `POST /api/data` — authenticated allowlisted read-only Sheets actions

## Local development

Copy `.dev.vars.example` to `.dev.vars` and supply local-only values. Never commit `.dev.vars`.

## Important deployment rule

A Git commit changing `.env.example` or documentation does not change the live Worker. Production changes are complete only after the canonical workflow deploys successfully and its post-deploy health/CORS checks pass.
