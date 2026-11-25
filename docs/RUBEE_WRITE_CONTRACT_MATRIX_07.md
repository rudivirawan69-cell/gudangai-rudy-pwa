# Rubee PWA Write Contract Matrix — 07

Audit date: 2026-11-25  
Branch: `project/rubee-intelligence-audit-20261125`  
Scope: source-level contract mapping only. No production changes, spreadsheet writes, secret rotation or deployment.

## 1. Verified end-to-end write paths

| PWA entry point | Adapter action | Apps Script handler | Destination / effect | Identity and confirmation |
|---|---|---|---|---|
| Barang masuk / keluar / rusak, one item | `addTransaction` | `addTransaction(body)` | Allowlisted transaction sheet: Barang masuk, Barang keluar, Barang Rusak | Per-item `clientItemId` becomes requestId; transactionId `TX-${clientItemId}`; nonce `NC-${clientItemId}`; `queueApproved:true`; result must be verified |
| Barang masuk / keluar / rusak, batch | `bulkTransaction` | `bulkTransaction(body)` | Same transaction sheet allowlist; maximum 35 items per backend batch | Stable per-item IDs plus batchId; per-item result mapping; backend ledger/read-back; partial result and unsent-item queue handling |
| Pending queue verification | `getTransactionStatus` (GET, then POST fallback) | `getTransactionStatus(body)` | Read-only idempotency ledger + transaction-sheet read-back | Requires transactionId, nonce and sheet; PWA removes an item only when success=true, status=APPLIED and readBack.matched=true |
| Final PO submission | `submitPO` | `writePurchaseOrder_(body)` | Writes the final PO table to `purchase order` using the backend PO writer | requestId is generated in the adapter when the call is made; Code.gs uses it for PO idempotency and digest conflict checks |
| PO arrival confirmation | `recordPOArrival` | `recordPOArrival(body)` then `addTransaction(...)` | Records arrival as Barang masuk after validating PO item, period, entity and SKU | requestId and derived POARR transactionId feed transaction idempotency; UI currently does not supply a persistent requestId |

### Realtime read path

`src/data/realTimeSync.js` independently sends `ping`, `bootstrap`, and `getStockDelta` directly to Apps Script. These are read/sync actions, but this independent direct path must also move to the shared Worker transport. Migrating only `api.js` is insufficient.

## 2. Contract details that must survive the migration

### Single transaction

Source confirms the PWA creates or preserves `clientItemId`, then derives:
- `requestId = clientItemId`
- `transactionId = TX-${clientItemId}`
- `nonce = NC-${clientItemId}`
- `queueApproved = true`
- `tanggal` normalized to `YYYY-MM-DD`
- `sheet` selected only from Barang masuk / Barang keluar / Barang Rusak
- `keterangan` normalized and capped at 200 characters in the adapter

The backend validates the sheet, entity, date, item code and quantity; claims the idempotency ledger before writing; and reads the written row back before returning confirmed success. A timeout/unknown result must not trigger a new identity.

### Batch transaction

- PWA chunk size: 35.
- Code.gs maximum batch size: 35.
- Code.gs requires `queueApproved:true` for offline/sync-mode bulk requests.
- Each item carries its own transactionId and nonce; the outer batch has a batchId.
- PWA maps backend results back to clientItemId and only marks confirmed items applied.
- Failed or unreported items are retained in the durable queue.
- Ambiguous results require read-back before retry; do not retry the entire batch under new identities.

### Offline queue

The adapter persists queue snapshots to IndexedDB, then verifies the localStorage mirror before acknowledging the mutation. Queue recovery, per-item identity, chunking, serial fallback and read-back are part of the write contract, not optional UI behavior.

### PO submission

The Code.gs PO writer uses a requestId-based idempotency record and a payload digest. An applied requestId reused with a different payload is rejected. An in-progress/unknown request is reconciled against the PO sheet before retry. Therefore, the caller must reuse the same requestId for the same logical PO submission.

### PO arrival

The Code.gs handler validates:
- requestId and positive bounded quantity;
- PO item identity;
- PO date/arrival date period;
- CV/PT entity eligibility;
- exact stock code and entity match.

It then records the arrival through `addTransaction` in `Barang masuk`. The PWA caller currently builds the payload without a stable requestId; the adapter generates a new one for each call. A repeated click after an ambiguous response can therefore create a different idempotency identity. This needs a persisted operation ID and explicit UI pending state before production cutover.

## 3. Worker gateway gaps confirmed in source

Current Worker routes include:
- `POST /api/data`: authenticated read-only action gateway.
- `GET /api/getStatusPO` and `GET /api/getPOTerlambat`: authenticated PO reads.
- `POST /api/agent`: authenticated agent.
- `GET /api/sync-all`: authenticated read-only aggregation.

No authenticated write proxy is present.

The Worker `READ_ONLY_ACTIONS` currently does not include at least:
- `getTransactionStatus` — required by PWA queue read-back.
- `getRequestStatus` — backend request-level reconciliation contract.
- `reconcileBatch` — backend batch reconciliation contract.
- `getPORequestStatus` — backend PO request status contract.

The existing `/api/data` handler rejects any action outside its read-only allowlist. It must not be used for writes. Add only narrowly scoped, schema-validated read-back actions after tests; do not broaden it into a generic arbitrary Apps Script action tunnel.

Worker authentication currently validates the Supabase bearer token and returns the user ID. The audited implementation does not perform an application-role/permission lookup. Identity authentication alone is not sufficient authorization for transaction writes, PO submission or PO arrival. Define and verify the operator/admin authorization source before enabling writes.

## 4. Source inconsistencies / release blockers

### B1 — Client-side Apps Script credential fallback (CRITICAL)

`src/data/api.js` contains a literal Apps Script API secret fallback in frontend source. The value is intentionally not reproduced. Treat it as compromised. Do not rotate it until all active clients have migrated to the Worker and the cutover plan can prevent old clients from falling back to the exposed credential.

### B2 — Two different Apps Script deployment URLs (CRITICAL)

`src/data/api.js` and `wrangler.jsonc:GUDANGAI_SHEETS_API_URL` point to different deployment URLs. The live canonical deployment, deployed version, spreadsheet target and Script Properties have not been verified. No source-only inference can decide which deployment is authoritative.

### B3 — Transaction read-back action missing from Worker allowlist (HIGH)

The PWA queue verifier calls `getTransactionStatus`, but Worker `READ_ONLY_ACTIONS` does not include it. A naive PWA migration to `/api/data` will break queue verification and may strand pending items.

### B4 — PO request IDs are not stable across UI retries (HIGH)

`submitPO` creates a fresh requestId inside the adapter when called. The PO page does not provide a stable persisted operation ID. `confirmPOStatus` also generates a fresh requestId when the payload omits one; the PO confirmation UI currently omits it. After an ambiguous timeout, a repeated click can use a new identity. Persist one requestId per logical operation and reuse it until confirmed or explicitly abandoned.

### B5 — Single/batch transaction behavior is inconsistent (HIGH)

In the audited Code.gs snapshot:
- `addTransaction` appends `appendIdentityMarker_(...)` to transaction `keterangan`.
- `bulkTransaction` also appends `appendIdentityMarker_(...)`.
- The single-item shortage/HOLD text uses the structured form `Input pending N > sisa stock X > kurang Y`.
- The bulk shortage/HOLD text uses a different form: `HOLD; orderQty: ...; availableQty: ...; shortageQty: ...`.

This is inconsistent with the required exact HOLD representation and with the intended ledger/read-back-only identity strategy. Resolve both code paths consistently, with regression tests, before production migration. Do not silently normalize historical rows.

### B6 — Supabase workflow startup failure is unresolved (MEDIUM)

Run `45602005023` completed with `startup_failure` and zero jobs. GitHub exposes no job logs because no job started. The workflow file defines a standard Node validation job; available evidence does not establish whether the cause is GitHub Actions startup/configuration, runner provisioning, workflow policy or another platform issue. Do not attribute it to missing secrets without evidence. Re-run or inspect repository Actions diagnostics separately.

## 5. Required Worker route contract (design target, not implemented)

| Route concept | Allowed action(s) | Required controls |
|---|---|---|
| Transaction write | `addTransaction` | Supabase bearer auth; operator role; strict sheet/entity/date/SKU/qty schema; server injects Apps Script secret; no client secret accepted |
| Batch write | `bulkTransaction` | Same controls; maximum 35; preserve batchId and all per-item identities; preserve per-item result array and partial semantics |
| Transaction read-back | `getTransactionStatus`, optionally `getRequestStatus` / `reconcileBatch` | Authenticated; bounded ID count; exact sheet allowlist; read-only; preserve readBack evidence |
| PO submit | `submitPO` | Explicit PO permission; stable requestId; payload schema; digest/idempotency; no arbitrary sheet/range input |
| PO arrival | `recordPOArrival` | Explicit receiving permission; stable requestId; exact item/period/entity/SKU validation; result tied to Barang masuk write |
| Realtime sync | `ping`, `bootstrap`, `getStockDelta` | Authenticated read-only; preserve masterVersion/stockVersion and source timestamps |

The Worker must construct the Apps Script payload itself and inject the server-side secret. Never forward a browser-supplied secret, arbitrary URL, arbitrary action, spreadsheet ID, sheet name outside the allowlist or range.

## 6. Verification and release gates

1. Owner verifies canonical Apps Script deployment, version, linked spreadsheet and Script Properties using read-only inspection.
2. Establish role source and authorization matrix for operator, supervisor and admin.
3. Correct B4/B5 and add regression tests on a non-production Apps Script deployment and isolated spreadsheet.
4. Implement Worker proxy and authenticated read-back routes; add schema, authorization, idempotency, partial batch and timeout tests.
5. Migrate both PWA adapters through one shared Worker client; add static checks for Apps Script URLs/secrets in browser bundle and direct browser-to-Apps-Script requests.
6. Test queue durability across reload/offline/online; test duplicate replay, partial batch and unknown write outcome.
7. Migrate PO request ID persistence and ambiguous-response UI state.
8. Perform controlled production cutover only after owner approval; then rotate/revoke the exposed Apps Script credential and verify active clients no longer call Apps Script directly.

## 7. Latest CI evidence for audited head

Commit: `90d8e81551ddef1c68c31b21234a1ba93f42cdf6`

- Agent Worker Tests run `45602002493`: success.
- Code.gs Contract run `45602002587`: success.
- Verify GudangAI PWA run `45602002457`: success.
- CI source/build run `45602002529`: success; canonical Worker deploy job was skipped.
- Supabase Auth checks run `45602005023`: startup_failure; zero jobs.

These are source/CI results only. They do not verify the live Apps Script deployment, live spreadsheet, production Worker bindings, or production write behavior.

## Status

SOURCE CONTRACT MAPPED — PRODUCTION MIGRATION NOT IMPLEMENTED — NOT READY FOR PRODUCTION.
