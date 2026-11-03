# Supabase Auth integration — Cloudflare Worker

## Authentication flow

The PWA signs operators in with Supabase Auth and sends the access token to the existing Worker in the Authorization: Bearer header. The Worker verifies it by requesting GET {SUPABASE_URL}/auth/v1/user with the publishable key in apikey and the user token in Authorization. The browser never supplies the identity or role that the Worker trusts.

The PWA currently calls Supabase Auth's documented HTTP endpoints directly (password sign-in, refresh-token grant, user lookup, and logout). This avoids adding an unpinned dependency while the repository's package lock remains stable. Session refresh is automatic and synchronized across tabs through browser storage events. A future migration to the official supabase-js client should preserve the same session contract and Worker bearer-token contract.

## PWA build variables

Set these as build-time variables in the environment that builds the PWA:

- VITE_SUPABASE_URL: URL of the active Supabase project.
- VITE_SUPABASE_PUBLISHABLE_KEY: publishable key (sb_publishable_...) or enabled legacy anon key.
- VITE_GUDANGAI_AI_API_BASE: existing Cloudflare Worker API origin.

For GitHub Actions, use repository Variables for the URL and publishable key; these are public client configuration, not secrets. For Cloudflare Pages, add the same variables to the build environment. Never place a service-role key in a VITE_ variable or browser bundle.

## Required Worker variables

Set these in the Cloudflare Worker environment (not in GitHub source):

- SUPABASE_URL: URL of the active Supabase project.
- SUPABASE_PUBLISHABLE_KEY: the project's publishable key or enabled legacy anon key.

No service-role key is needed for this authentication flow.

## Source file

cloudflare/worker-supabase-auth.js is a protected Worker variant based on the Worker source supplied in this conversation. It preserves AI and ASSETS bindings, /api/chat, /api/models, Claude streaming, non-streaming responses, and static asset fallback.

It additionally verifies API callers with Supabase Auth, restricts browser origins, ignores browser-supplied system prompts, validates messages/model/token limits, and applies the existing 20 requests/minute limit per authenticated user and IP. The in-memory rate limit is not a strict global limit.

## Deployment safety

This file is intentionally NOT connected to the root wrangler.jsonc. That file currently describes the PWA static-assets deployment and has no Worker entrypoint. Do not run wrangler deploy from this repository or change that config as part of this patch; doing so could alter the existing production static-assets setup.

Before deploying:
1. Restore/activate the intended Supabase project and confirm its URL and publishable key.
2. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY as Worker environment variables.
3. Confirm AI and ASSETS bindings remain attached.
4. Confirm the allowed-origin list matches the exact production PWA origin.
5. Test missing token (401), invalid token (401), valid token (200), disallowed origin (403), invalid JSON (400), oversized body (413), rate limit (429), SSE completion, and static asset fallback.
6. Deploy only the Worker service, not the static-assets PWA configuration.

## Authorization boundary

A valid Supabase account is required for chat access. The user object returned by Supabase is the trusted identity. Authorization metadata is read only from Supabase server response app_metadata, never user_metadata or frontend profile state. Add stricter role policies before exposing stock/PO tools.

## Current limitation

This phase authenticates Claude API access only. It does not yet connect the Worker to Google Sheets or Apps Script. Live stock and PO answers remain unavailable until read-only data tools are implemented and verified.
