# Rubee Intelligence — Audit Findings 01

Audit date: 2026-11-25. Audited ref: main. Source audit only; no live spreadsheet, Apps Script deployment, or production Worker was read.

## Corrections and findings

### F-001 CRITICAL — public client-side API credential exposure
Repository metadata confirms this GitHub repository is public. The frontend file src/data/api.js contains a hardcoded Apps Script endpoint and literal fallback API secret. The credential must be treated as compromised. Do not reproduce it in logs, issues, commits, or this report.
Required: rotate/revoke the corresponding Apps Script API_SECRET through the authorized owner; remove client-side secret fallback; route PWA reads/writes through authenticated Cloudflare Worker with server-side secret storage; verify Apps Script rejects unauthenticated requests; add secret scanning. Historical rotation is required even if source history is later cleaned.
No rotation or production configuration change was performed.

### F-002 HIGH — exact SKU action routing is wrong/incomplete
Correction: Code.gs DOES implement getStockByCode in doPost and defines getStockByCode(kode, requestedEntitas). Earlier preliminary claim that this handler was absent was incorrect.
Confirmed Worker issue: gatherLiveData derives actions from intent detection and does not force getStockByCode for an exact SKU token. General stock intent currently routes to searchByName; extractStockQuery strips CV/PT/WK tokens. This can degrade "CV-0030" into partial search.
Required: exact SKU parser, preserve prefix, normalize whitespace/case, call getStockByCode only, validate returned exact code/entity, test supported code families, unknown and ambiguous codes.

### F-003 HIGH — transaction action hardcodes Barang keluar
Worker gatherLiveData sets sheet="Barang keluar" for every getTransactionHistory request. Code.gs getTransactionHistory honors params.sheet and defaults to Barang keluar. Therefore a Barang Masuk question can be routed to Barang keluar.
Required: extract and validate explicit transaction type (Barang masuk, Barang keluar, Barang Rusak/LO); no silent default when user specified another type; ask clarification when ambiguous; regression-test latest records for each sheet.

### F-004 HIGH — getAgentKnowledge missing in Code.gs
cloudflare/agentSkills.js and Worker allowlist include getAgentKnowledge; Worker sends mode="manifest". Audited Code.gs doPost/doGet switches and source text contain no handler/case. Expected backend result is UNKNOWN_ACTION unless deployed code differs.
Required: read-only handler dynamically reads actual spreadsheet tabs, title, count, names and source read timestamp; no IDs/secrets; test added/renamed/hidden/deleted sheets.

### F-005 HIGH — live action success validation is fail-open
Worker gatherLiveData treats any response other than success:false as successful. No action-specific schema validation before passing payload to model. callSheetsRead adds gateway readAt, which is not proof of source spreadsheet read time.
Required: require success===true; validate expected fields/types and identity; distinguish sourceReadAt from gatewayReceivedAt; statuses VERIFIED/PARTIAL/EMPTY/NOT_FOUND/STALE/FAILED/CONFLICT; prevent model from stating numbers from failed/unverified results.

### F-006 MEDIUM — static knowledge version drift
Code.gs header says V6.6.5+DEPLOY-READY; cloudflare/agentSkills.js static structure knowledge says V6.5.4+. Generate versioned knowledge with source commit, generated time, backend version and deployment verification status.

### F-007 MEDIUM — provider selection conditional
Worker prefers 9Router when both key and model are configured, then falls back to Workers AI; otherwise Workers AI. Health endpoint exposes configuration flags. Production provider selection has not been verified. UI should show actual provider/model from each response. Benchmark before replacement.

## PWA source facts verified
- src/App.jsx main navigation: Beranda, Stok, Input, PO, Lainnya; latter includes Agent Rubee AI, Riwayat, Sinkronisasi, Pengaturan.
- Lazy-loaded pages: DashboardPage, StokPage, InputPage, POPage, RiwayatPage, SettingsPage, SyncQueuePage, AIAssistantPage.
- src/main.jsx imports global CSS and registers versioned sw.js with user-confirmed update.
- AIAssistantPage sends message/history/read-only context to /api/agent and checks /api/agent/health.
- src/data/api.js currently contains direct Apps Script endpoint and client-side secret fallback (F-001).

## Code.gs source facts verified
- 4,422 lines in audited main snapshot.
- doPost validates payload/schemaVersion/API_SECRET then dispatches actions.
- doGet has separate read-only switch and blocks selected write/admin actions.
- Confirmed handlers include getStockByCode, getAllStock, getLowStock, getStockoutRisk, getTransactionHistory, searchByName, getDashboardData, getStatusPO and others.
- getTransactionHistory accepts params.sheet and defaults to Barang keluar.
- Trigger installer references sendDailyStockReport, weeklyPOAutomation, logDailySnapshot, refreshAllData and onEdit.
- Full function/action/trigger/write/read inventory remains incomplete. Repository snapshot does not prove deployed Apps Script version.

## Repository and CI facts
- Repository is public; main tree snapshot contains 316 entries.
- PR #210 remains draft.
- Its documentation-only workflow run succeeded; that is not evidence that app build, agent tests, Apps Script contract tests, or production integration passed.
- No production deployment was initiated.

## Remaining work
1. Complete Code.gs function, dispatcher, trigger, write/read, auth and spreadsheet-resolution inventory.
2. Complete Worker endpoint/action/intent/provider map and tests.
3. Complete PWA page-to-data-adapter-to-backend flow map.
4. Inspect Supabase auth/RLS/functions read-only.
5. Obtain authorized read-only live spreadsheet manifest and compare with docs.
6. Verify deployed Apps Script and Worker versions without exposing secrets.
7. Implement F-001 through F-005 in isolated changes after credential rotation and migration plan.
8. Benchmark models after deterministic action execution/provenance is fixed.

## Release decision
NOT READY FOR MERGE OR DEPLOY. Critical credential exposure requires immediate owner-side rotation. Production spreadsheet tests remain read-only.
