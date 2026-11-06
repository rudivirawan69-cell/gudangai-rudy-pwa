# GudangAI RUDY — Full AI Intelligence System

## Status

This branch introduces the first isolated frontend foundation for Claude chat. It does **not** claim that stock, purchase-order, transaction, cold-storage, or Google Sheets tools are connected yet.

- Default model: `anthropic/claude-sonnet-5.5`
- Worker API base: `VITE_GUDANGAI_AI_API_BASE` or `https://gudangai-rudy.rudivirawan69.workers.dev`
- Routes consumed: `GET /api/models`, `POST /api/chat`
- Streaming: Server-Sent Events, with incremental UTF-8 decoding and event-boundary buffering.
- Chat history: in-memory for the current page session only; it is not persisted to localStorage.
- The system prompt explicitly states that this first-stage assistant has no live spreadsheet access and must not invent current stock or PO facts.

## Production safety boundary

The existing Apps Script API remains the source of truth. The AI frontend does not import transaction write functions and does not send any stock mutation request.

Do not point Claude at raw spreadsheet credentials or expose Apps Script secrets in the browser. Any future data tools must execute server-side behind an authenticated Worker endpoint, enforce user/role authorization, validate arguments, apply read-only access by default, and write only through the existing approved transaction functions after explicit confirmation.

The PWA's current local PIN login is a client-side convenience mechanism, not server-verifiable identity. It must not be treated as authorization for sensitive AI tools. Before enabling private stock/PO data or write tools, introduce server-verifiable identity (for example, signed short-lived sessions) and audit logging.

## Deployment boundary

The repository's current `wrangler.jsonc` config describes static assets and does not include the Claude Worker source or AI binding declaration. The production deployment workflow deploys using that config. Therefore:

1. Keep the currently working Claude Worker deployment intact.
2. Do not replace the Worker entrypoint or Wrangler configuration until its live source, bindings, routes, and secrets are recovered and reviewed.
3. Verify `/api/models` and both streaming/non-streaming `/api/chat` modes against the production Worker before merging this frontend.
4. Verify CORS for the production PWA origin and any preview origin.
5. Never commit API tokens, account IDs, model-provider keys, or Apps Script secrets.

## Full-system implementation phases

### Phase 1 — Chat foundation (this branch)
- Add a dedicated AI tab.
- Read the model catalog from the Worker.
- Default to Claude Sonnet 5.5.
- Stream responses and handle chunk boundaries, HTTP errors, offline state, and abort.
- Keep conversation ephemeral and avoid transmitting warehouse data.

### Phase 2 — Secure read-only data tools
- Recover and version the actual Worker source.
- Add server-verifiable authentication and per-user authorization.
- Implement allowlisted read tools for stock summary, item lookup, division status, PO status, transaction history, and System Log.
- Read through existing Apps Script actions; do not duplicate stock calculations in Claude.
- Treat `Stock Awal` as the master-item source and preserve `Data Stok Per Divisi` column F formulas/realtime semantics.

### Phase 3 — Intelligence modules
- Stock anomaly and stock-risk analysis with source timestamps.
- Purchasing recommendations based on verified movement/usage history and explicit assumptions.
- Transaction reconciliation and queue diagnostics.
- Cold-storage analysis only when sensor/temperature data exists.
- Daily/weekly supervisor reports with traceable source references.

### Phase 4 — Controlled actions
- Add draft-only PO/report actions first.
- Require a clear confirmation screen before any write.
- Route approved writes through existing backend transaction contracts and idempotency keys.
- Log actor, tool, arguments, confirmation, result, and source read-back.

## Acceptance criteria before production activation

- [ ] GitHub Actions build, lint, and PWA smoke tests pass.
- [ ] Production Worker model catalog returns valid model IDs.
- [ ] Non-streaming response returns valid JSON.
- [ ] Streaming response parses split SSE frames and `[DONE]` correctly.
- [ ] HTTP 429 displays a useful retry message.
- [ ] CORS works from the production PWA origin.
- [ ] No credentials or spreadsheet secrets are shipped to the browser.
- [ ] No AI tool can write to Stock CV, Stock PT, Dashboard, or PO source sheets directly.
- [ ] Existing Apps Script transaction, offline queue, idempotency, and read-back contracts remain unchanged.
- [ ] Read-only tools cite source sheet/action and read timestamp in each answer.
- [ ] Any write action requires explicit operator confirmation and server-side authorization.
