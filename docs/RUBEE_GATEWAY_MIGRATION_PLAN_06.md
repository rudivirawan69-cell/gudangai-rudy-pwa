# Rubee Gateway Migration Plan — 06

Audit date: 2026-11-25
Branch: `project/rubee-intelligence-audit-20261125`
Scope: source-level migration plan only. No production changes.

## Executive finding

The PWA currently has two direct Apps Script configurations that do not match the Apps Script URL configured in the canonical Worker `wrangler.jsonc`:

- `src/data/api.js`: `DEFAULT_API_URL` points to a different Apps Script deployment than `wrangler.jsonc:GUDANGAI_SHEETS_API_URL`.
- `src/data/realTimeSync.js`: obtains endpoint from localStorage or `window.__GUDANGAI_API_URL__`, then POSTs directly to that endpoint.
- `src/data/api.js`: contains a literal fallback Apps Script API secret in client-delivered source. The literal value is intentionally not reproduced here. Treat it as compromised and rotate it only after coordinated cutover.

This means current PWA calls can be routed to different Apps Script deployments depending on which adapter/configuration path is used. The actual deployment IDs, target spreadsheets, Script Properties and deployed versions have not been verified live. Do not infer which deployment is canonical from source alone.

## Verified source routes

### PWA API adapter (`src/data/api.js`)

- Read path: `getJson(action, params)` uses `DEFAULT_API_URL` / localStorage and may attach the client-side fallback secret.
- POST path: `postJson(payload)` sends JSON to the same direct Apps Script endpoint.
- Read actions include stock, dashboard, PO status and transaction-history/status reads.
- Write actions include transaction sync/batch/bulk flows, PO submission and PO arrival confirmation.
- Transaction queue, requestId, transactionId, nonce, clientItemId, read-back verification and bulk chunking are implemented in this adapter. Preserve their semantics exactly.

### Realtime sync adapter (`src/data/realTimeSync.js`)

- Reads endpoint from `localStorage.gudangai_api_url` or `window.__GUDANGAI_API_URL__`.
- Reads secret from `localStorage.gudangai_api_secret` or `window.__GUDANGAI_API_SECRET__`.
- Makes a direct POST to Apps Script.
- This is an independent path; changing only `api.js` will not remove the bypass.

### Canonical Worker (`worker.js`)

- `/api/data`: POST, authenticated with Supabase access token, read-only action gateway.
- `/api/getStatusPO` and `/api/getPOTerlambat`: GET, authenticated PO read routes.
- `/api/agent`: POST, authenticated agent route.
- `/api/sync-all`: GET, authenticated read-only sync summary.
- There is no general authenticated write proxy route for PWA transaction and PO writes in the audited route table.
- Worker-to-Apps-Script authentication is server-side via `GUDANGAI_SHEETS_API_SECRET`.

## Non-negotiable data contract for migration

Do not replace a direct endpoint with `/api/data` for writes. `/api/data` is read-only.

Before changing PWA transport, implement and test explicit Worker write proxy routes for the existing allowlisted Apps Script actions. The proxy must:

1. Verify Supabase bearer token and enforce user/role authorization server-side.
2. Accept only explicit allowlisted actions and validated payload schemas.
3. Preserve existing Apps Script transaction semantics: `clientItemId`, `requestId`, `transactionId`, `nonce`, `queueApproved`, `bulktransaction` / batch identity, and read-back reconciliation.
4. Preserve CV/PT entity mapping, sheet allowlist (Barang masuk, Barang keluar, Barang Rusak), date format, quantity validation, and existing response shape needed by the queue.
5. Never expose the Apps Script secret to browser code, localStorage, query parameters or client logs.
6. Fail closed on unknown actions, missing auth, malformed payloads, ambiguous source results and mismatched transaction identities.
7. Avoid retries that can duplicate writes. On ambiguous timeout, retain identity and use status/read-back reconciliation before any resend.
8. Emit auditable request correlation without recording credentials or sensitive payload contents.

## Coordinated cutover sequence

### Phase A — establish the real source of truth (read-only)

- Owner verifies which Apps Script deployment is canonical, its deployed version, linked spreadsheet identity/title and Script Properties.
- Owner verifies the Worker production bindings and secrets by names/targets only; never print values.
- Confirm which direct endpoint in the current PWA is still active in installed clients and service-worker caches.
- Do not rotate the old secret yet; current clients may still depend on it.

### Phase B — build the Worker write proxy

- Add explicit Worker routes for single transaction, batch/bulk transaction, status/read-back, PO submission and PO arrival only where corresponding Code.gs contracts are confirmed.
- Add schema and role tests for every write action.
- Add idempotency and ambiguous-timeout tests, including partial batch results.
- Test against a non-production Apps Script deployment and isolated test spreadsheet.

### Phase C — migrate both PWA adapters

- Route `api.js` and `realTimeSync.js` through one shared authenticated Worker transport.
- Remove browser fallback secret and direct Apps Script endpoint from client bundles.
- Preserve offline queue persistence, queue identity, serial fallback, batch chunking, reconciliation and existing UI response contracts.
- Add static checks that fail if frontend source contains Apps Script secrets or direct Apps Script POST paths.

### Phase D — controlled production cutover

- Only after Phase B/C tests pass, schedule an owner-approved coordinated change window.
- Deploy Worker proxy first, verify authenticated read and controlled test write.
- Release PWA that uses Worker exclusively.
- Confirm active clients no longer send direct Apps Script requests.
- Rotate/revoke the exposed Apps Script secret and update Worker server-side secret.
- Verify normal transactions, batch partial success, offline recovery, duplicate suppression and read-back.
- Keep rollback plan that does not re-enable a publicly exposed client secret.

## Acceptance tests required before release

- Exact SKU reads for CV/BBCV/PT/WK/MM/BBPT; unknown prefixes fail closed.
- Explicit transaction history sheet selection for Barang masuk / Barang keluar / Barang Rusak.
- Unauthorized user cannot call any read or write route.
- Non-admin cannot execute admin-only actions.
- Single transaction, batch 35-item example, partial success, duplicate replay and ambiguous timeout.
- Offline queue survives reload and uses same transaction identity during reconciliation.
- PO submit and PO arrival preserve existing date/period validation and response contract.
- Worker does not log or return Apps Script secret.
- Bundle scan finds no Apps Script secret fallback and no direct Apps Script endpoint.
- Production read-only smoke and approved controlled write test both pass.

## Current evidence and blockers

- Latest Agent Worker workflow: 52/52 tests passed.
- Code.gs static contract workflow: passed.
- PWA regression, lint, production build, browser smoke and visual evidence: passed in the latest completed run. Browser smoke covered primary tabs, MoreSheet destinations, stock CV/PT/division behavior, full-screen edges, Input draft recovery, five viewport widths and three themes.
- Canonical Cloudflare production deploy job: skipped.
- Supabase Auth workflow: startup_failure; it does not provide a successful auth verification.
- No live Apps Script deployment version, spreadsheet manifest, deployment URL ownership or Script Properties were verified.
- No write proxy, endpoint migration, credential rotation, production deployment or spreadsheet mutation has been performed.

## Release status

DRAFT — source/test checks pass for the current audited scope, but production gateway migration is not implemented. Do not merge or deploy until all phases and acceptance tests above are completed and explicitly approved.
