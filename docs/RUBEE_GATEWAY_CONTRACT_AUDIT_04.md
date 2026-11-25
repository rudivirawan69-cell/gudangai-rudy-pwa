# Rubee Intelligence — PWA Gateway and Contract Audit 04

Audit date: 2026-11-25
Audited source: main
Method: static source inspection only. No live Apps Script/Worker endpoint call, no spreadsheet read/write, no secret rotation, no production deploy.

## F-012 CRITICAL — two different Apps Script deployment URLs are configured in source
Evidence:
- src/data/api.js defines a default Apps Script endpoint (legacy direct PWA API).
- wrangler.jsonc defines GUDANGAI_SHEETS_API_URL with a different Apps Script deployment URL (Worker-to-Apps-Script gateway).
- The source values are intentionally not copied into this report.
Impact:
- PWA direct transaction/bootstrap/realtime requests and Worker agent reads may reach different Apps Script deployments, versions, spreadsheet targets, Script Properties, or secrets.
- A user may see inconsistent data or have a read action work while a write action reaches a different backend.
- The existence of two URLs does not prove which is currently live or whether either deployment is stale.
Required:
1. Identify the intended canonical Apps Script deployment using owner-controlled deployment metadata.
2. Compare deployment version, project identity, spreadsheet target, API_SECRET rotation state and handler code for both endpoints without exposing secrets.
3. Establish one canonical server-side Worker gateway.
4. Migrate every PWA read/write/realtime caller only after the Worker exposes equivalent authenticated endpoints and preserves idempotency/outbox semantics.
5. Remove legacy direct endpoint and credential fallbacks after staged migration and device compatibility checks.
No migration or endpoint change was performed.

## F-013 HIGH — exact SKU intent is not deterministic
Evidence:
- Worker LIVE_INTENTS includes a broad searchByName stock pattern.
- No exact SKU pattern is present in root worker.js.
- READ_ONLY_ACTIONS does include getStockByCode, but gatherLiveData does not route exact code messages to it.
- extractStockQuery strips common words including CV/PT/WK tokens.
- Code.gs doPost supports getStockByCode and expects body.kode or body.kodeBarang plus optional entitas.
Impact: an exact code question may invoke searchByName and query extraction can strip the code prefix.
Required: exact SKU-first parsing, preserve prefix, normalize only whitespace/case, send kode and kodeBarang, enforce exactly one result, validate code/entity, and test exact/unknown/ambiguous/whitespace/entity cases.

## F-014 HIGH — Barang Masuk query is routed to Barang keluar
Evidence:
- LIVE_INTENTS detects Barang masuk, Barang keluar and Barang rusak.
- gatherLiveData unconditionally sets params.sheet = Barang keluar for getTransactionHistory.
- Code.gs getTransactionHistory uses params.sheet, then defaults to Barang keluar.
Impact: valid rows from the wrong sheet can be presented as Barang Masuk.
Required: parse and allowlist the explicit sheet, never silently default for explicit type, clarify when ambiguous, validate returned source and add tests per sheet.

## F-015 HIGH — live action success checks fail open
Evidence:
- gatherLiveData considers a response successful whenever raw.success !== false.
- handleReadOnlyData returns HTTP 200 unless result.success === false.
- callSheetsRead does not reject HTTP 200 payloads without success:true.
- callSheetsRead adds readAt after gateway response; this is gateway receipt time, not source spreadsheet read time.
- handleSyncAll also accepts raw.success !== false per action.
Impact: unknown-action, malformed or incomplete payloads may be treated as valid; unverified numbers may reach the model.
Required: require success === true; per-action schema validation; sourceReadAt separate from gatewayReceivedAt; fail closed on missing envelope, wrong types/action or identity mismatch; machine statuses VERIFIED/EMPTY/NOT_FOUND/PARTIAL/STALE/FAILED/CONFLICT.

## F-016 HIGH — read-only allowlist includes an indirect spreadsheet mutation
Evidence: Worker READ_ONLY_ACTIONS includes getConfig; Code.gs getConfig calls readConfig_; readConfig_ calls getConfigSheet_; getConfigSheet_ creates a missing Config tab via insertSheet.
Required: getConfig strictly read-only and return CONFIG_SHEET_NOT_FOUND when absent; keep creation in explicit setup action; test mutation-method spies.

## F-017 HIGH — manifest Worker test is not an end-to-end contract test
Evidence: scripts/test-agent-worker.mjs stubs Apps Script and verifies Worker routing; Code.gs snapshot has no getAgentKnowledge case/function.
Required: cross-layer contract test compares Worker action allowlist and intents with Code.gs dispatcher and handlers; test real manifest handler in staging/mock; add to CI.

## PWA and auth data paths
- AIAssistantPage sends bearer token to Worker /api/agent; Worker verifies Supabase access token before reading data.
- Root Worker /api/data also authenticates bearer token and uses read-only action allowlist.
- src/data/api.js has direct Apps Script endpoint and fallback API credential; transaction/write logic is in this module.
- src/data/realTimeSync.js independently reads endpoint and secret from localStorage/window globals and directly calls Apps Script for ping/bootstrap/delta.
- Therefore there are multiple data planes: AI reads via Worker, generic read-only reads via Worker, and direct PWA operational/write/realtime calls to Apps Script.
- cloudflare/worker-supabase-auth.js is an alternate isolated worker and comments say it is not wired to root wrangler.jsonc.
- Supabase publishable/anon key is client-visible by design subject to RLS; it is not equivalent to a service-role secret.

## Agent UI and provider facts
- AIAssistantPage displays health model and whether primary AI binding is configured.
- It sends active skill, up to 8 history items, read-only constraints and limited persistent memory records.
- Root worker tries 9Router only when both key and model are configured; on failure it falls back to Workers AI; otherwise it uses Workers AI.
- Worker response includes provider/model fields from runtime result. UI stores model/provider on assistant messages.
- Health endpoint reports configuration, not proof a provider invocation succeeded.
- Static skills advertise getAgentKnowledge and baseline V6.5.4+, while Code.gs header says V6.6.5+DEPLOY-READY.
- No model benchmark has been run.

## Release gate
Do not merge/deploy runtime fixes until credential rotation and endpoint ownership are resolved; PWA callers are mapped and migration preserves transaction IDs, idempotency ledger, bulk behavior, durable IndexedDB queue and reconciliation; exact SKU, transaction sheet, manifest and strict response tests pass; every allowlisted action is proven read-only; CI/build/browser smoke pass; live read-only tests verify deployed Worker/Apps Script versions and source timestamps.