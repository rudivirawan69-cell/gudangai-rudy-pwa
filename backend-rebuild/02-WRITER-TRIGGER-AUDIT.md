# V7 Backend Audit — Write Scope, Formulas, Triggers

Date: 2026-11-01  
Branch: `rebuild/codegs-v7-foundation`  
Status: **PATCH COMMITTED — NOT DEPLOYED**

## Evidence reviewed

- Main `Code.gs`: 4,331 lines and 166 global functions before the V7 patch.
- Main file preserved as the base because its API payload limit `MAX_KETERANGAN_LENGTH=200` matches the PWA client's `keterangan.slice(0, 200)`.
- The combined candidate allows 4,500 characters for Keterangan and is not a safe drop-in replacement for the current PWA contract.
- Code.gs repository candidates are not proof of the exact Apps Script project currently deployed. The reported installed copy has not yet been reconciled.

## Confirmed high-risk findings

1. `syncDivisionStockLightweight_()` wrote values directly to column F using `dest.getRange(row, 6).setValue(...)`. This replaced formula cells.
2. `syncDivisionStock()` cleared and rewrote the entire A:G block with static values, including F. This also removed formula behavior.
3. The old full rebuild derives master rows from `Stock Awal`, but wrote the calculated stock map as literal values instead of formulas.
4. Dashboard paths contained separate legacy writers and layout installers. The setup function could run a layout formatter that clears/rebuilds chart objects. The diagnostic function also cleared and wrote Dashboard cells.
5. The project had multiple Dashboard trigger installers. A function named `onEdit` was also installed as a trigger handler, risking duplicate simple/installable edit handling.

## V7 patch committed

- Lightweight division sync is now read-only for spreadsheet cells. Formula recalculation is delegated to Google Sheets.
- Added source-header discovery for `Stock CV`, `Stock PT`, and `Stock Bahan Baku`.
- Full division-table rebuild writes metadata columns A:E and G, then writes formulas into F. Routing is strict: BBCV/BBPT → `Stock Bahan Baku`; CV → `Stock CV`; PT/WK/MM → `Stock PT`; unknown prefixes fail closed with `=0` (no cross-entity fallback).
- Divisi `DAPUR1` / `DAPUR2` are normalized to `DAPUR 1` / `DAPUR 2` before grouping.
- Added post-write audit counting item codes and F formulas.
- Dashboard diagnostics are read-only.
- Legacy Dashboard layout and card writers are disabled to prevent chart deletion or overlapping writers.
- Dashboard scheduled refresh ownership is consolidated to `refreshDashboardDataLight693_()`.
- Renamed the installable edit handler to `onEditRouter_()`; the function name `onEdit` is no longer present, so only the installable router is expected to run.
- `setupEnvironment()` no longer runs the legacy Dashboard layout migration.
- PWA payload contract remains 200 characters for Keterangan; `clientItemId` is explicitly accepted by the transaction validator and qty 0/negative/over-limit is rejected.
- Stock shortage/HOLD notes now reserve room for the structured `Input pending ...` suffix inside the 200-character Keterangan limit.
- Identity markers are not appended into Keterangan. Before single or bulk journal writes, the Idempotency Ledger records the planned destination row, final qty and Keterangan fingerprint. Read-back validates date, SKU, qty and Keterangan fingerprint against that row.
- Bulk allocation now finds and verifies a contiguous empty block across B:C and F:G. A prior bulk identity marked UNKNOWN / write-intent with no successful read-back is returned as `READBACK_REQUIRED`; it is not automatically written again. Partial write exceptions are treated conservatively as UNKNOWN.

## Remaining safety gates

- The V7 code is committed to the reconstruction branch only. It is not merged to `main`, pasted into Apps Script, or deployed.
- Live Spreadsheet verification is still required for actual source headers, item code families, 191-row coverage, formula counts, manual edit recalculation, and the true live trigger inventory.
- Dashboard final layout is not migrated. The existing PO renderer and chart/data layout require reconciliation against the requested final design before any one-time layout migration.
- Repository CI passed on commit `e6d2f79253e75212a5975bd9493fde13986e0357`: Code.gs static/unit contract, PWA verification (including the existing PDF precision/manual-sync contract harness), and the main Vite CI build. These are repository checks, not live Apps Script/Spreadsheet integration tests.
- Live transaction/bulk/idempotency/offline queue, timeout recovery, HOLD, actual PDF file imports and Apps Script API regression tests remain release gates.
- Repository Code.gs and edit-router tests use sheet name `Barang Rusak`; the operational notes also refer to `Barang Rusak/LO`. Confirm the exact live tab name before deployment.
- Cloudflare PWA deployment is a separate release gate and is unchanged by this Code.gs patch.

## Required live verification sequence

1. Export the exact deployed Apps Script project and compare it with this branch.
2. Inspect actual source headers and row counts for Stock CV/PT/Stock Bahan Baku.
3. Run `auditDivisionStockFormulaCells_()` read-only and verify all item rows have formulas in column F.
4. In a staging copy, run `syncDivisionStock({force:true})`; confirm formulas in F and no source-sheet writes.
5. Manually edit a permitted source transaction in staging; confirm F recalculates with no backend write to F.
6. Inspect trigger inventory after setup; expected managed handlers: daily stock report 07:00, weekly PO Monday 08:00, daily snapshot 23:00, Dashboard refresh every 10 minutes, one installable `onEditRouter_`.
7. Run API contract, single/bulk transaction, partial batch, duplicate replay, timeout reconciliation, stock shortage/HOLD, and PWA integration tests.
8. Review draft PR #84; merge only after the live/staging gates above are approved.
9. Deploy Apps Script separately, then validate the Cloudflare PWA endpoint separately.
