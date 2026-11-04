# GudangAI Dual-Agent Service Binding Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with TDD and verification before completion.

**Goal:** Make `gudangai-rudy-pwa69` the authenticated PWA gateway, with Workers AI as primary and the existing `claude-proxy` Worker as an optional internal fallback through Cloudflare Service Binding.

**Architecture:** The gateway Worker serves the built PWA assets, validates Supabase access tokens, calls its own Workers AI binding first, and only on primary failure forwards the existing `{ message, context, history }` contract to `claude-proxy` through Service Binding. The proxy remains a separately configured Worker and keeps Anthropic fallback disabled unless explicitly enabled.

**Tech Stack:** Cloudflare Workers, Wrangler JSONC, Workers AI, Service Bindings, Supabase Auth REST endpoint, Node.js test runner, GitHub Actions.

**Spec:** User-approved architecture in this conversation: Workers AI primary, Claude optional fallback, no extra paid usage by default, development branch, audit/tests/evidence.

## Global Constraints

- Do not modify `main` directly.
- Keep `ANTHROPIC_FALLBACK_ENABLED=false` by default.
- Never put Supabase service-role keys or Anthropic keys in browser code or Git.
- Preserve the existing PWA static asset build and the proxy's `/api/agent` request contract.
- Deploy only by explicit workflow dispatch after secrets and dry-run validation.
- Keep production deployment disabled on feature-branch pushes.

## Review Focus

- Missing or invalid Supabase bearer token must stop before either AI provider is called.
- Workers AI success must not invoke the proxy.
- Workers AI failure must call the proxy exactly once and forward the existing payload and bearer token.
- Proxy failure must return a bounded 503 response without leaking credentials.
- CORS preflight must allow Authorization only for configured origins.
- Health reporting must not imply the Claude fallback is active when Anthropic is disabled.

---

### Task 1: Gateway contract tests

**Files:**
- Create: `scripts/test-gateway-worker.mjs`
- Modify: `.github/workflows/supabase-auth-check.yml`

**Interfaces:**
- Consumes: gateway Worker default export from `cloudflare/gateway-worker.js`.
- Produces: executable Node test coverage for auth, primary routing, Service Binding fallback, failure handling, and CORS.

- [ ] Write tests first and verify they fail because the gateway implementation is absent.
- [ ] Add the gateway test to the Supabase Auth GitHub Actions workflow.
- [ ] Verify the expected red result on the development branch.

### Task 2: Authenticated gateway implementation

**Files:**
- Create: `cloudflare/gateway-worker.js`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Input: `POST /api/agent` JSON `{ message, context, history }` plus `Authorization: Bearer <Supabase access token>`.
- Output: existing Agent JSON response shape `{ success, reply, model, provider, mode }`.
- Binding: `CLAUDE_PROXY` Service Binding targeting service `claude-proxy`.

- [ ] Implement Supabase token verification before AI use.
- [ ] Implement Workers AI primary.
- [ ] On primary failure only, forward the same request contract and bearer token through Service Binding.
- [ ] Preserve PWA static assets through `ASSETS`.
- [ ] Verify gateway tests and full repository checks.

### Task 3: Separate proxy deployment configuration and safe workflow

**Files:**
- Create: `wrangler.proxy.jsonc`
- Modify: `.github/workflows/deploy-cloudflare-production.yml`

**Interfaces:**
- Gateway Worker: `gudangai-rudy-pwa69`, configured by root `wrangler.jsonc`.
- Proxy Worker: `claude-proxy`, configured by `wrangler.proxy.jsonc`.
- Deployment: manual dispatch only; validate Cloudflare and Supabase credentials, dry-run both configs, deploy proxy before gateway.

- [ ] Keep feature-branch pushes from triggering production deployment.
- [ ] Keep Anthropic fallback disabled by default.
- [ ] Verify workflow syntax and CI checks.
- [ ] Do not claim deployment until a successful Cloudflare workflow and live health checks exist.

### Task 4: Review and evidence

- [ ] Inspect the final diff and verify no secrets are committed.
- [ ] Run all relevant GitHub Actions checks.
- [ ] Open/update a draft PR against `main`.
- [ ] Report exact commit, test runs, PR, and any deployment blocker.
