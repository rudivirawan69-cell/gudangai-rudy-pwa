# Initial Backend Inventory Findings

Date: 2026-11-01
Branch: `rebuild/codegs-v7-foundation`

## Files inspected

| Candidate | Repository path | Blob SHA | Size |
|---|---|---|---:|
| Main Code.gs | `Code.gs` | `596200eaa6f43fdfe663b29cc6bb54670c5d6f43` | 226,635 bytes |
| Combined production fixes | `audit-apps-script/Code_GudangAI_V6.6.5_COMBINED_PRODUCTION_FIXES.gs` | `04d610cee043df8f4129b018f7f386d3975fdd78` | 246,319 bytes |
| Release candidate | `audit-apps-script/Code_GudangAI_V6.6.5_RELEASE_CANDIDATE.gs` | `c7758a1fc580de033511325842f1e15252b86b83` | 220,034 bytes |

## Confirmed differences that block blind replacement

| Item | Main Code.gs | Combined candidate |
|---|---|---|
| Keterangan max length | 200 | 4500 |
| PO base header/data | row 5 / row 6 | row 5 / row 6 plus locked Dashboard PO metadata |
| Dashboard PO constants | `PO_SECTION_CURRENT_ROW=46`, `PO_DASHBOARD_MAX_VISIBLE_ROWS=16` | `STATUS_PO_LAYOUT_VERSION='6.9.0-LOCKED-ROW46'`, `PO_START_ROW=46`, `PO_DASHBOARD_HEADER_ROW=49`, `PO_DASHBOARD_MAX_VISIBLE_ROWS=50` |
| Header/source notes | Labels file as V6.6.5+DEPLOY-READY, while embedded source baseline says V6.4.8+SYNC | Same general header, different constant contract |

The combined candidate's 4500-character Keterangan allowance conflicts with the PWA API payload currently found in the repository, which trims Keterangan to 200 characters. Preserve the PWA 200-character contract unless an explicit, tested API migration is approved.

## Confirmed API/transaction entry points

- Main Code.gs contains `doGet(e)`, `doPost(e)`, `addTransaction(body)`, and `bulkTransaction(body)`.
- Main Code.gs routes both `getDashboardData` and `getDashboardLegacy` to `getDashboardData()` in the inspected search result.
- Main Code.gs has a GET-side blocklist for write-like actions including transaction, PO, Dashboard refresh, stock sync, and snapshot operations; GET must remain read-only.
- PWA API client constructs `addTransaction` payloads with `tanggal`, `kodeBarang`, `qty`, `keterangan.slice(0, 200)`, `requestId`, `transactionId`, `nonce`, and `queueApproved`.
- Main Code.gs has a `bulkTransaction` guard requiring `queueApproved=true` for offline/outbox synchronization modes.

## Trigger and Dashboard risk signals

- Main Code.gs has multiple `ScriptApp.newTrigger(...)` statements in its setup path.
- A separate historical PO/Dashboard module, `docs/STATUS_PO_ALIGNED_DASHBOARD_V6.7.gs`, also creates a 10-minute Dashboard trigger. This is a concrete duplicate-trigger risk if that module was pasted into the live Apps Script project.
- `setupNewPeriod()` invokes `syncDivisionStock()` and `refreshDashboard()`; side effects must be mapped before this function is retained or migrated.
- Historical deployment documentation still describes Dashboard PO panels at A28:F44 and H28:M43. That conflicts with the later locked row-46 PO layout. Do not use the historical layout instructions as a write target.

## Next audit actions

1. Extract every global function and constant from all three candidate files and calculate duplicates.
2. Inspect full `doGet` / `doPost` routing and map every action to the PWA client.
3. Find every SpreadsheetApp write call and classify by sheet/range/owner.
4. Map every trigger creator, trigger deleter, and scheduled handler.
5. Compare the main Code.gs against combined and release-candidate files function-by-function.
6. Do not select a production baseline until live Apps Script deployment evidence is available.
