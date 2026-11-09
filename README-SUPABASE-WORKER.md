# GudangAI RUDY — Cloudflare Worker + Supabase

## Production target

- Worker: `gudangai-rudy`
- URL: `https://gudangai-rudy.rudivirawan69.workers.dev`
- Supabase project: `https://cbeosysruwkfwgklziog.supabase.co`
- Google Sheets gateway: configured by `GUDANGAI_SHEETS_API_URL` in `wrangler.jsonc`

## Authentication

The PWA sends the Supabase session access token as `Authorization: Bearer <access_token>`.
The Worker verifies it against `/auth/v1/user` using the project's publishable API key.
Protected routes include `/api/agent`, `/api/claude`, and `/api/data`.
Do not use a Supabase service-role/secret key for this verification path. No service-role key is required.

## Worker secrets

Set the publishable key as a Worker secret (not a source-code value):

```bash
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
```

The read-only Apps Script gateway also requires `GUDANGAI_SHEETS_API_SECRET` as a Worker secret.
The project URL is a non-secret variable in `wrangler.jsonc`.

## Endpoints

- `GET /api/agent/health` — public health/configuration status
- `POST /api/agent` — authenticated read-only agent
- `POST /api/claude` — compatibility alias, authenticated
- `POST /api/data` — authenticated allowlisted read-only Sheets actions

## Local development

Copy `.dev.vars.example` to `.dev.vars`, then supply local-only values. Never commit `.dev.vars`.

## CI/CD

Pull requests run the agent test and Vite production build. A push to `main` runs the same checks and then deploys the Worker using GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
