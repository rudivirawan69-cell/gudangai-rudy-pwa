# GudangAI dual-agent Workers and Supabase Auth

## Runtime architecture

- PWA gateway: `gudangai-rudy-pwa69`, configured by root `wrangler.jsonc`.
- AI primary: the gateway's Cloudflare Workers AI binding (`AI`).
- Internal fallback: Cloudflare Service Binding `CLAUDE_PROXY` targeting Worker service `claude-proxy`.
- Proxy Worker: `claude-proxy`, configured by `wrangler.proxy.jsonc`.
- Supabase Auth: both Workers verify the incoming user access token with `GET {SUPABASE_URL}/auth/v1/user`.

The browser calls same-origin `POST /api/agent` with the established request contract:

```json
{
  "message": "Periksa prioritas stok",
  "context": {},
  "history": []
}
```

It must also send `Authorization: Bearer <Supabase access token>`. The gateway validates the token before calling any AI provider. Workers AI runs first. Only if it fails does the gateway forward the same `message/context/history` contract and bearer token through the Service Binding to `claude-proxy`. The proxy validates the token again before processing the request.

## Provider and cost behavior

- Gateway Workers AI is primary.
- The proxy's own Workers AI is its first internal provider.
- Anthropic is an optional downstream fallback in the proxy, and remains disabled by default through `ANTHROPIC_FALLBACK_ENABLED=false`.
- Do not add an Anthropic API key or enable the fallback unless paid Claude usage is explicitly approved.
- Service Binding avoids a public internet hop between Workers; it does not make external model inference free.
- No Google Sheets or Apps Script writes are performed by this Agent route. It receives only the context sent by the PWA and provides analysis.

## Supabase configuration

Worker secrets (set separately on both Worker services):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (a Supabase publishable key or enabled legacy anon key is accepted by the Auth user endpoint)

PWA build-time public configuration:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The GitHub deployment workflow uses `vars.VITE_SUPABASE_URL` and `vars.VITE_SUPABASE_PUBLISHABLE_KEY`, falling back to the corresponding Supabase secrets when repository variables are absent.

Never expose a Supabase service-role/secret key in a `VITE_*` variable or browser bundle. A service-role key is not required for this Auth verification flow.

## Wrangler configuration

- `wrangler.jsonc`: deploys the PWA gateway named `gudangai-rudy-pwa69`, serves `./dist`, binds Workers AI as `AI`, and binds `CLAUDE_PROXY` to the existing `claude-proxy` service.
- `wrangler.proxy.jsonc`: deploys the existing `worker.js` entrypoint as `claude-proxy`, retains its AI and static asset bindings, and keeps Anthropic fallback disabled.

The exact browser origins allowed by each Worker are configured in its Wrangler `ALLOWED_ORIGINS` variable. Do not replace this allow-list with a wildcard.

## Deployment safety

The Cloudflare deployment workflow is manual-dispatch only. It:
1. Installs locked dependencies and runs the gateway and proxy tests.
2. Builds the PWA with its public Supabase Auth configuration.
3. Validates Cloudflare and Supabase configuration before making changes.
4. Runs Wrangler dry-run for both Worker configurations.
5. Configures the Supabase verification secrets on both Workers.
6. Deploys `claude-proxy` first, then `gudangai-rudy-pwa69`.

Required GitHub Actions secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Optional GitHub Actions repository variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The workflow must not run automatically on feature-branch pushes or pull-request events. Do not report deployment as complete until the manual workflow succeeds and both live health endpoints are checked.

## Verification endpoints

- PWA gateway: `GET https://gudangai-rudy-pwa69.rudivirawan69.workers.dev/api/agent/health`
- Proxy Worker: `GET https://claude-proxy.rudivirawan69.workers.dev/api/agent/health`

Expected gateway health fields include `primary=cloudflare-workers-ai`, `proxyBindingConfigured=true`, `proxyReachable=true`, `authRequired=true`, and `anthropicFallbackEnabled=false` unless the paid fallback has explicitly been enabled.

## Security and limitations

- Missing/invalid Supabase sessions are rejected before either AI provider is called.
- Browser-supplied identity, role, or system prompt is not trusted.
- Request message length is limited; history is compacted before provider calls.
- The proxy performs its own Supabase token verification as defense in depth.
- Agent context is limited to what the PWA sends. This implementation does not query Google Sheets or Apps Script directly and must not claim to know live stock beyond supplied context.
- `cloudflare/worker-supabase-auth.js` remains a legacy/reference Worker variant and is not the production gateway entrypoint.
