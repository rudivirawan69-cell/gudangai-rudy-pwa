# Rubee Intelligence — Architecture Inventory 02

Audit date: 2026-11-25
Source ref: main
Scope: source-only static inspection. No live spreadsheet read and no production deployment inspection.

## Repository inventory
- Public repository, default branch main.
- Recursive main tree: 316 entries.
- Main runtime files: worker.js (408 lines), cloudflare/agentSkills.js (113 lines), Code.gs (4,422 lines / 171 top-level function declarations), src/App.jsx (335 lines), src/main.jsx (82 lines), src/pages/AIAssistantPage.jsx (304 lines), src/data/api.js, src/data/realTimeSync.js, src/hooks/useBootstrap.js, src/data/offlineStore.js.
- App navigation and lazy page map are recorded in RUBEE_AUDIT_FINDINGS_01.md.
- package scripts: build, lint, test, test:agent, test:dates, assemble-api.
- Build runs assemble-api, icon generation, service-worker version generation, Vite build, then removes dist/_redirects.

## Code.gs dispatcher inventory
The audited doPost switch includes these action names/aliases:
validateTransaction, validateImportedItems, getRequestStatus, syncTransaction, syncBatch, bulkSync, getTransactionStatus, bootstrap, addTransaction, addTransactionBatch, bulkTransaction, reconcileBatch, getStock, getStockByCode, getAllStock, getStockAll, getLowStock, getStockoutRisk, getLastUpdate, getTransactionHistory, searchByName, getDashboard, getDashboardData, getDashboardLegacy, refreshDashboard, syncDivision, syncDivisionStock, writePO, writePORecommendations, generatePO, writePurchaseOrder, submitPO, sendPO, runPOAnalysis, getPOAnalysis, logDailySnapshot, clearMasterCache, maintenanceCleanup, getConfig, diagnoseStockFormulas, setupConfig, setActivePeriod, setupNewPeriod, status, ping, healthCheck, getStockDelta, getStatusPO, recordPOArrival, getPORequestStatus, refreshDashboardPO, getSyncMetrics.
No getAgentKnowledge action or function exists in the audited Code.gs snapshot.

### Main Code.gs function groups identified
- Spreadsheet resolution/config: getSpreadsheetId, getSS, getConfigSheet_, readConfig_, getActiveMonth*, setActivePeriod, setupNewPeriod.
- Request/auth/idempotency: doPost, doGet, normalizeIncomingRequest_, identity/ledger helpers, read-back and reconcile helpers.
- Transaction writes: syncTransaction, addTransaction, bulkTransaction, addTransactionBatch dispatcher, write audit log, duplicate checks, row safety and hold checks.
- Stock reads/master: getStockByCode, getAllStock, getLowStock, getStockoutRisk, searchByName, getBahanBakuStockMap_.
- Dashboard/division: syncDivisionStock, getDashboardData, getDashboard, snapshots, timestamp and chart helpers.
- PO: generatePORecommendations, writePORecommendations, writePurchaseOrder_, analyzePORecommendations_, getStatusPO, recordPOArrival, PO formatting and weekly rollover.
- Operations/maintenance: sendDailyStockReport, weeklyPOAutomation, processEmailQueue, onEdit, maintenanceCleanup, setupEnvironment, getHealthStatus_, sync metrics and circuit-state helpers.
Full per-function call graph and exact read/write side effects remain to be completed.

## Spreadsheet source mapping verified from source code (not live manifest)
- Transaction sheet allowlist in Code.gs: Barang masuk, Barang keluar, Barang Rusak.
- Each transaction sheet configured with headerRow 3 and six transaction columns; Barang Rusak uses "Jumlah" where the other sheets use "QTY".
- Stock reads: getAllStock reads Stock CV and Stock PT, then also obtains bahan baku via getBahanBakuStockMap_ / Stock Bahan Baku.
- getStockByCode uses master-map lookup and falls back to getAllStock("ALL") if needed.
- Spreadsheet target is resolved dynamically: active spreadsheet first, Script Properties SPREADSHEET_ID second, fallback constant third.
- This does not establish the actual live spreadsheet title, current tab count, actual tab names beyond code references, or deployed Script Properties.

## Additional finding F-008 — HIGH: a nominal read action may create a spreadsheet tab
Evidence:
- doPost exposes getConfig as a read-like action.
- getConfig calls readConfig_().
- readConfig_ calls getConfigSheet_().
- getConfigSheet_ returns the Config sheet if found, but calls ss.insertSheet(CONFIG_SHEET_NAME) if missing.
Impact:
- If Config is absent, a supposedly read-only getConfig call mutates the spreadsheet by creating a tab.
Required:
- Split pure read from setup/migration. getConfig must return CONFIG_SHEET_NOT_FOUND without mutation when missing.
- Keep sheet creation in explicit admin/setup action only.
- Add a mock test asserting read-only actions never call insertSheet, setValue, setValues, appendRow, delete, clear, or formatting mutation methods.
- Audit all other allowlisted actions for indirect write side effects before calling the allowlist read-only.

## Additional finding F-009 — HIGH: current manifest test does not prove Apps Script supports the action
Evidence:
- scripts/test-agent-worker.mjs test "spreadsheet structure questions route to getAgentKnowledge manifest through read-only gateway" stubs the upstream gateway and checks Worker sent the action.
- The test does not assert Code.gs doPost has a getAgentKnowledge case or handler.
- Current Code.gs source has zero occurrences of getAgentKnowledge.
Impact:
- Worker routing test passes even though Apps Script rejects the action as unknown.
Required:
- Add cross-layer contract test that compares every Worker READ_ONLY_ACTIONS entry with an actual Code.gs doPost case and handler.
- Include explicit negative assertion for unknown action and positive assertion for manifest handler.
- Integration test against Apps Script staging/mock endpoint, not production writes.

## Additional finding F-010 — HIGH: two direct PWA-to-Apps-Script paths bypass Worker auth gateway
Evidence:
- src/data/api.js contains getApiUrl/getApiSecret and directly POSTs action + secret to a Google Apps Script URL.
- src/data/realTimeSync.js independently reads endpoint and secret from localStorage/window globals and directly POSTs to Apps Script.
- Worker /api/data and /api/agent use Supabase bearer-token authentication and server-side gateway secret.
Impact:
- Data access and transaction writes are not uniformly mediated by Worker/Supabase auth.
- Browser-held API secret is exposed to the client runtime and repository; this compounds F-001.
- Security policy, rate limits, audit context and request validation can differ between paths.
Required:
- Map every caller in PWA and migrate deliberately to one authenticated gateway contract.
- Preserve transaction idempotency, bulk transaction semantics, queue durability, and read-back/reconciliation during migration.
- Do not simply remove direct paths until Worker has safe write endpoints and all clients are migrated.
- Rotate exposed secret before/alongside migration.

## Additional finding F-011 — MEDIUM: live-data test fixture is too permissive for provenance correctness
Evidence:
- Existing test validates that dataSources contains an action/readAt and that a mock result is sent to prompt.
- Existing mock test uses synthetic upstream responses; it cannot prove source read timestamp or action schema is accurate.
- Worker stamps readAt after the Apps Script response in callSheetsRead.
Required:
- Use separate sourceReadAt and gatewayReceivedAt.
- Contract tests per action; invalid/malformed payloads must fail closed.
- Verify exact returned item identity and source before displaying numerical data.

## Worker/provider and auth architecture facts
- Worker default model constant in source is @cf/meta/llama-3.1-8b-instruct.
- If both NINE_ROUTER_API_KEY and NINE_ROUTER_MODEL are configured, Worker tries 9Router first and falls back to Workers AI on error; otherwise Workers AI is used.
- /api/agent/health reports provider configuration flags, model and action lists; configuration presence is not proof of provider success or correct model quality.
- /api/agent authenticates Supabase bearer token, gathers live data, builds system prompt and invokes configured model.
- /api/data authenticates Supabase bearer token and proxies actions in READ_ONLY_ACTIONS.
- Separate cloudflare/worker-supabase-auth.js exists but comments state it is intentionally not wired to root wrangler.jsonc.
- src/data/supabaseAuth.js has a Supabase URL and publishable key fallback. A publishable/anon key is designed for client use subject to correct RLS; do not confuse it with service-role secret.

## Security note
The PWA's direct Apps Script path and client fallback secret are a critical credential-handling defect in a public repository. Treat the secret as compromised and rotate it. This report deliberately omits its value.

## Test / CI interpretation
- scripts/test-agent-worker.mjs includes worker routing, auth, read-only gateway, prompt and PO endpoint tests.
- Current manifest test is a Worker-only mocked routing test, not end-to-end Apps Script manifest verification.
- PR #210's first successful workflow run is documentation-only and cannot be used as evidence that application build or live integration is valid.
- Production workflow includes build, Wrangler dry-run/deploy, runtime secret application, app asset smoke tests, Worker health and CORS checks; do not trigger it for this audit branch.
