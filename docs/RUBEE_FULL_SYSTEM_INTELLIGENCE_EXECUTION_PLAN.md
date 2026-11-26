# Rubee Full System Intelligence — Execution Plan and Evidence Ledger

Status: DRAFT / AUDIT-ONLY / NOT PRODUCTION READY
Base: `main` at `0e1c6f7dfa3724ccf791e01d6a00fad6f8f8ff1b` (2026-11-26 04:01:21 UTC)
Branch: `feat/rubee-full-system-intelligence-live`
Safety: no production deployment, Apps Script deployment, spreadsheet write, secret rotation, Supabase schema mutation, or merge is authorized by this PR.

## 1. Purpose

Deliver one source-grounded Rubee intelligence layer that can explain and safely read the actual GudangAI PWA, Cloudflare Worker, deployed Apps Script backend, and primary spreadsheet. It must distinguish repository snapshots from verified production state and must never invent operational values.

This PR begins as an evidence-led execution plan. It does not claim that live spreadsheet access, complete system indexing, or production deployment has been implemented.

## 2. Current baseline

Repository: `rudivirawan69-cell/gudangai-rudy-pwa`
Base commit: `0e1c6f7dfa3724ccf791e01d6a00fad6f8f8ff1b`
Default branch: `main`

Main files inspected at this base:
- `worker.js` — blob `b98dbef5a64ce811a804cfe52ca74d74c92181c8`
- `cloudflare/agentSkills.js` — blob `f77a216f331f432a944dee71f6c58c087109d582`
- `Code.gs` — blob `49511c10e18adc01327509438188e16e0969b5ad`; header identifies `6.6.5+DEPLOY-READY`
- `scripts/test-agent-worker.mjs` — blob `489d4ddda13e80146cc97ebae76049b321ed329f`
- `src/data/api.js` — blob `8e06955e1b68465e0f5010b11f271a18a2a1e6a3`
- `src/data/realTimeSync.js` — blob `cef2c7876f0d8d67a1235e66caec8a4792045fdc`
- `package.json` — blob `d7e98341eed4d99f313b03674e5a637d0d122afc`

Current main combined status includes multiple Vercel contexts failing with a build-rate-limit destination. This is not evidence that the source build itself failed or passed; CI must be re-run/verified in the relevant GitHub Actions environment.

## 3. Relevant PR audit and disposition

| PR | Scope | Current disposition | Reuse decision |
|---|---|---|---|
| #174 | Full Code.gs index + paginated spreadsheet knowledge | Open, unmerged; old base | Do not merge directly; inspect and selectively port |
| #175 | Complete Code.gs + spreadsheet knowledge integration | Open, unmerged; old base | Primary implementation reference; significant overlap with #174 |
| #177 | Agent knowledge / HOLD unification | Open, unmerged | Audit exact diff and preserve only compatible contracts |
| #180 | Live spreadsheet knowledge manifest | Merged | Reuse routing concept; live Apps Script support is not proven |
| #179 | Cloudflare API routing before SPA fallback | Merged | Existing foundation; regression test on current main |
| #210 | Rubee source-grounded intelligence audit | Merged | Treat its findings and migration plan as mandatory baseline |
| #209 | Exact SKU routing and concise response | Open | Selectively port after verifying current main and tests |
| #140 | Supabase auth and live-data health hardening | Open | Do not merge as-is; inspect current auth contracts and secret names |
| #130 | Supabase Agent integration | Open | Historical reference only pending overlap/security audit |
| #125 | Agent Supabase auth wiring | Open | Historical reference; verify whether superseded |
| #213/#218 | Durable 5s handoff and behavioral verification | Merged | Preserve transaction/outbox behavior; outside the knowledge index write path |

PR #174 and #175 modify the same core files and substantially overlap. They must not be merged together blindly. Their implementation must be compared against current main and the actual deployed Apps Script contract.

## 4. Confirmed source-level blockers from the merged Rubee audit

The following findings are documented in main audit artifacts and must be independently revalidated against the current source before code changes:

### Critical security and transport
- F-001: the public repository audit found a literal Apps Script credential fallback in frontend source. Treat the credential as compromised. Never reproduce it. A safe removal requires a staged migration and authorized rotation/revocation; do not break existing operators by simply deleting the fallback before the canonical Worker path is proven.
- F-010: `src/data/api.js` and `src/data/realTimeSync.js` contain direct Apps Script transport paths. Migrating only one file does not close the bypass. Inventory all callers and route them through the authenticated Worker without changing transaction semantics.

### Data correctness and live provenance
- F-002: exact SKU questions must preserve and validate the full code and entity prefix and use the exact-code action, not broad name search.
- F-003: transaction-history routing must preserve the requested sheet (Barang masuk, Barang keluar, Barang Rusak) and must not silently default to Barang keluar when another type was requested.
- F-004: Worker and `agentSkills.js` advertise `getAgentKnowledge`, while the audited Code.gs dispatcher snapshot had no matching handler. A Worker stub test is insufficient.
- F-005: live data validation must fail closed. Require explicit success envelopes, action-specific schemas, source timestamps, identity checks, and completeness status. Gateway receive time is not source spreadsheet read time.
- F-008: audit all nominal read actions for indirect spreadsheet mutation. The audit found a `getConfig` path that may create the Config sheet if absent.
- F-009: add a cross-layer contract test comparing every Worker read action with an actual Apps Script dispatcher case and handler; test the negative/unknown-action path too.

### Version and deployment drift
- Current repository Code.gs snapshot identifies `6.6.5+DEPLOY-READY`.
- The operator's separately confirmed installed library copy is documented as `6.6.6+HOLD-SIMPLE+AGENT-KNOWLEDGE`.
- These are not interchangeable. No GitHub Code.gs snapshot may be deployed over the installed 6.6.6 backend without a reviewed, version-specific patch and explicit operator deployment.
- Main's static knowledge text must not claim to represent the live spreadsheet or installed backend unless a runtime verification record supports it.

## 5. Target architecture

1. **PWA inventory:** route/page map, state stores, API adapters, offline queue, realtime sync, PDF/bulk processing, PO and history paths.
2. **Worker inventory:** route registry, auth, authorization, CORS, AI provider selection, action allowlist, intent routing, gateway, validation, errors and observability.
3. **Apps Script inventory:** deployed version evidence, doGet/doPost dispatch, every handler, read/write side effects, triggers, formulas, locks, idempotency, caches and logs.
4. **Spreadsheet live manifest:** actual spreadsheet title and tabs, headers, dimensions, row identity, formula metadata where safe, source-of-truth mappings and source read timestamp. Do not expose spreadsheet IDs, secrets, private identifiers, or unnecessary personal data.
5. **Knowledge retrieval:** build-time, versioned Code.gs/PWA/Worker source index with source commit, file hash, generated time and line ranges; live spreadsheet reads remain live and separate from source snapshots.
6. **Operational skills:** exact SKU lookup, stock reconciliation, stock-risk analysis, PO analysis, transaction-history audit, queue diagnostics, PDF/bulk validation, cold-storage analysis only when real sensor data exists, and source-grounded troubleshooting.
7. **Answer contract:** distinguish VERIFIED, PARTIAL, EMPTY, NOT_FOUND, STALE, FAILED and CONFLICT; cite sheet/action/range or file/line, sourceReadAt, and backend/version identity.

All knowledge reads are read-only. Do not add arbitrary Apps Script execution, generic action forwarding, or new spreadsheet write permissions.

## 6. Implementation sequence

- [ ] Revalidate all audit findings against current main and exact PR diffs.
- [ ] Capture and compare the current deployed Worker identity/configuration without exposing secret values.
- [ ] Obtain authorized read-only evidence for the installed Apps Script deployment/version and spreadsheet manifest.
- [ ] Reconcile the installed 6.6.6 backend contract with repository Code.gs 6.6.5; prepare a narrowly scoped patch for the installed version if needed.
- [ ] Define typed schemas for every read action and source timestamp semantics.
- [ ] Add cross-layer Worker allowlist ↔ Code.gs dispatcher/handler contract tests.
- [ ] Add fail-closed validation tests for malformed, partial, stale, failed, empty and conflicting responses.
- [ ] Fix exact SKU and transaction sheet routing with deterministic regression tests.
- [ ] Build complete source indexes for PWA, Worker and Code.gs, with line-addressable provenance and source hashes.
- [ ] Implement/verify Apps Script manifest/search/page handler with bounded pagination and explicit read-only side-effect tests.
- [ ] Migrate both PWA direct transport modules to the authenticated Worker in a staged, backward-compatible cutover.
- [ ] Complete authorized credential rotation only after all active callers use the canonical gateway.
- [ ] Run full unit, agent, build, lint, static security, bundle secret scan, and browser smoke tests.
- [ ] Run authenticated read-only live smoke tests against the confirmed canonical Worker and Apps Script deployment.
- [ ] Compare live spreadsheet manifest and selected read-only values with operator-visible spreadsheet records.
- [ ] Verify stale/error behavior and prove that no unverified values are presented as live.
- [ ] Submit final evidence report and request review. Merge/deploy remain separate explicit gates.

## 7. Acceptance criteria — all required

### Source completeness
- [ ] Every PWA route/page and data adapter inventoried.
- [ ] Every Worker route, provider path, read action, and auth gate inventoried.
- [ ] Every Code.gs top-level function, dispatcher case, trigger and side effect inventoried.
- [ ] Every live spreadsheet tab/header and source-of-truth relationship verified.
- [ ] Source index hashes and line references match the exact source commit/backend version.

### Live correctness
- [ ] Live manifest returns actual current tabs and headers with source read timestamp.
- [ ] Pagination has deterministic coverage with no missing/duplicate ranges.
- [ ] Exact SKU/entity lookup is exact and fail-closed.
- [ ] Each transaction history sheet maps to the correct sheet.
- [ ] All action responses pass action-specific schema and provenance validation.
- [ ] Stale, partial, empty, unauthorized, failed and conflicting reads are accurately represented.
- [ ] No live answer is emitted from a mock, static snapshot, gateway timestamp, or failed action.

### Security and regression
- [ ] No client bundle contains Apps Script secret or direct privileged endpoint fallback.
- [ ] All sensitive reads require server-verifiable Supabase authentication and appropriate authorization.
- [ ] No read-only action mutates spreadsheet state, including indirect setup helpers.
- [ ] No new write permissions are introduced for knowledge retrieval.
- [ ] Existing transaction, 35-item bulk, idempotency, offline queue, 5-second handoff, read-back, PO and history behavior remain green.
- [ ] Build, lint, all relevant tests and browser smoke pass on the final PR head.
- [ ] Production read-only smoke is authenticated and evidence-backed.

## 8. Explicit release gates

- This PR must remain Draft until source-level implementation and CI are complete.
- No merge, Apps Script deployment, Cloudflare deployment, Supabase mutation, spreadsheet write, or credential rotation is performed by this PR.
- A failed/unavailable production verification means NOT VERIFIED, never PASS.
- Merge and deployment require a separate final review and explicit authorization after every acceptance criterion is evidenced.

## 9. Evidence sources

- `docs/RUBEE_INTELLIGENCE_PROJECT.md`
- `docs/RUBEE_AUDIT_FINDINGS_01.md`
- `docs/RUBEE_ARCHITECTURE_INVENTORY_02.md`
- `docs/RUBEE_SUPABASE_AUDIT_03.md`
- `docs/RUBEE_GATEWAY_CONTRACT_AUDIT_04.md`
- `docs/RUBEE_CODEGS_FUNCTION_INVENTORY_05.md`
- `docs/RUBEE_GATEWAY_MIGRATION_PLAN_06.md`
- `docs/RUBEE_WRITE_CONTRACT_MATRIX_07.md`
- `docs/RUBEE_AGENT_STOCK_LIVE_FIX_08.md`
- PRs #174, #175, #177, #179, #180, #209, #210, #213, #218
