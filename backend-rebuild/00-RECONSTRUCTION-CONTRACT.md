# GudangAI-69 Code.gs V7 — Controlled Reconstruction Contract

Status: INVENTORY IN PROGRESS — NOT FOR PRODUCTION DEPLOYMENT

## Non-negotiable safety rules

1. Preserve all verified production behavior and PWA API contracts before refactoring.
2. Never replace the live Code.gs wholesale based on an incomplete inventory.
3. Transaction writes are restricted to `Barang masuk`, `Barang keluar`, and `Barang Rusak/LO` (confirm exact production tab spelling before migration).
4. Never write transaction results or stock balances directly into `Stock CV` or `Stock PT`; preserve their formulas and source-of-truth role.
5. `Data Stok Per Divisi` column F (Sisa Stok) must remain formula-protected and reflect manual spreadsheet edits as well as PWA transactions. No backend writer may replace those formulas.
6. Preserve the 191-item master catalog from `Stock Awal`, including CV/PT/WK/MM and the agreed code-family mapping. Reconcile actual sheet contents before asserting the final count.
7. Idempotency must be verified against persisted transaction rows, not inferred from a ledger marker alone. Unknown-after-timeout is a reconciliation state, never an automatic blind retry.
8. Do not remove validations, PDF/photo recognition rules, audit trails, or working compatibility functions to improve speed.
9. Exactly one managed trigger installer owns scheduled triggers. Remove duplicates only after inventorying existing handlers and confirming intended schedules.
10. Dashboard writers must be inventoried and reduced to one approved owner. Preserve the locked PO Dashboard ranges and existing charts; no legacy writer may overwrite them.
11. Cloudflare is the primary PWA deployment target. Apps Script deployment and Cloudflare deployment are separate release gates.
12. No production deployment until syntax, contract, regression, spreadsheet-write-scope, idempotency, and PWA integration tests pass.

## Verified repository evidence at start

- Repository: `rudivirawan69-cell/gudangai-rudy-pwa`
- Working branch created: `rebuild/codegs-v7-foundation` (branched from `main`)
- Main backend file: `Code.gs` (repository main; header labels it V6.6.5+DEPLOY-READY)
- Additional candidate: `audit-apps-script/Code_GudangAI_V6.6.5_COMBINED_PRODUCTION_FIXES.gs`
- Candidate files are not interchangeable: their constants differ.
- Main Code.gs currently declares `MAX_KETERANGAN_LENGTH = 200`, `PO_HEADER_ROW = 5`, `PO_DATA_START_ROW = 6`, and a Dashboard PO section beginning at row 46.
- Combined candidate currently declares `MAX_KETERANGAN_LENGTH = 4500`, `STATUS_PO_LAYOUT_VERSION = '6.9.0-LOCKED-ROW46'`, `PO_START_ROW = 46`, and `PO_DASHBOARD_HEADER_ROW = 49`.
- The repository documentation also contains older PO layout instructions (A28:F44 / H28:M43). These are historical instructions, not authority to overwrite the currently locked layout.
- Therefore, no candidate is accepted as production truth until the complete code, latest production deployment, spreadsheet layout/formulas, triggers, and PWA action contracts are reconciled.

## Build order

### Phase 0 — Freeze and inventory
- Capture current main and production candidate file hashes.
- Enumerate every global function and constant in each candidate.
- Find duplicate function names, duplicate trigger installers, and every SpreadsheetApp write call.
- Enumerate doGet/doPost actions and every PWA action caller.
- Inventory spreadsheet tab names, column maps, protected formulas, and PO/Dashboard ranges.
- Record all active triggers from the production Apps Script project (requires owner-side evidence).

### Phase 1 — Compatibility contract
- Create a function migration register: KEEP, MERGE, REWRITE, DEPRECATE.
- Create API request/response fixtures for every PWA action.
- Define transaction state machine: VALIDATED → RESERVED → WRITTEN → VERIFIED; UNKNOWN requires reconciliation.
- Define spreadsheet write allowlist and explicit formula-protected ranges.

### Phase 2 — Modular implementation
Apps Script files share one global namespace. Modules must use unique names and avoid duplicate top-level const/let declarations.
- 00_Config.gs
- 01_CoreSpreadsheet.gs
- 02_ApiGateway.gs
- 03_AuthAndValidation.gs
- 04_TransactionEngine.gs
- 05_IdempotencyLedger.gs
- 06_MasterCatalog.gs
- 07_StockReadModel.gs
- 08_DivisionSyncReadOnly.gs
- 09_PurchaseOrder.gs
- 10_DashboardReadModel.gs
- 11_TriggerManager.gs
- 12_AuditAndRecovery.gs
- 13_AutomationsAndReports.gs
- 90_CompatibilityFacade.gs
- 99_TestHarness.gs

Modules may initially delegate to retained proven functions. No function is removed until callers, side effects, and test coverage are established.

### Phase 3 — Verification
- Syntax and duplicate-global scan.
- PWA action contract tests.
- Valid/invalid single transaction tests.
- Mixed-validity bulk tests and 40–50 item stress tests.
- Duplicate and concurrent idempotency tests.
- Timeout before write / after write / before response reconciliation tests.
- Formula integrity check for all 191 Sisa Stok cells in column F.
- Manual spreadsheet edit → PWA refresh/version detection test.
- PO and Dashboard locked-range/chart regression tests.
- Trigger count and schedule verification.

### Phase 4 — Release
- Backup production project and spreadsheet.
- Deploy Apps Script as a new version without deleting the prior deployment.
- Verify endpoint against PWA in a controlled test.
- Deploy PWA to Cloudflare only after backend contract tests pass.
- Publish exact commit, Apps Script version/deployment, Cloudflare deployment, and test evidence.

## Open blockers

- Confirm which Code.gs candidate is actually deployed in Apps Script.
- Reconcile the main Code.gs and combined candidate differences, especially Keterangan length and PO layout constants.
- Confirm the actual production tab name for damaged/LO transactions.
- Obtain production trigger inventory and Spreadsheet formula/layout snapshot.
- Confirm whether the latest 191-item source and manual-edit sync behavior are present in the production spreadsheet.
