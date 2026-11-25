# Rubee Intelligence & Project Knowledge — Project Charter

Status: AUDIT PHASE — NOT PRODUCTION READY
Created: 2026-11-25
Base: main at branch creation
Dedicated branch: project/rubee-intelligence-audit-20261125

## Mission

Build a source-grounded intelligence layer for GudangAI RUDY. Rubee must understand the actual PWA, Cloudflare Worker, Apps Script backend, spreadsheet schema, operational workflows, and project constraints. It must never present guessed, stale, inferred, or model-generated operational values as verified facts.

## Non-negotiable rules

1. No operational number without a traceable source record or deterministic calculation from traceable source records.
2. No live-data claim unless the corresponding backend read action completed successfully and its result passed validation.
3. On missing, failed, stale, partial, or conflicting data, disclose that state and do not fill gaps.
4. Keep source facts, deterministic calculations, interpretations, forecasts, and recommendations visibly distinct.
5. Keep all initial integration and acceptance tests read-only against production spreadsheets.
6. Never change production Sheets, Apps Script deployment, Worker deployment, Supabase schema, or PWA production as part of audit-only work.
7. Do not merge or deploy this project until acceptance criteria pass and release is explicitly authorized.
8. Do not expose secrets, tokens, private identifiers, or unnecessary personal data in prompts, logs, or reports.

## Scope

- PWA: application entry, routing/pages, authentication, state/data adapters, API layer, offline queue, realtime sync, themes, service worker, build and deployment.
- Cloudflare Worker: routes, auth, CORS, AI provider selection, prompts, intent detection, read-action allowlist, Apps Script gateway, validation, timeout/error handling, logging.
- Apps Script Code.gs: doPost/doGet, action switch, read handlers, write handlers, validation, spreadsheet resolution, schemas, formulas, triggers, idempotency, logs, locks, caching and permissions.
- Spreadsheet: actual tab manifest, headers, row/column conventions, formulas, source-of-truth mapping, entity/code mapping, operational data flow and cross-sheet dependencies.
- Supabase: auth integration, schema/tables, RLS, edge functions, secrets by name only, logs and operational dependencies.
- AI/agent options: benchmark candidate models/providers and specialist-agent architecture against the same grounded task suite; no provider or model replacement before evidence-based comparison.

## Initial repository evidence (snapshot only; not live production evidence)

Repository: rudivirawan69-cell/gudangai-rudy-pwa
Default branch inspected: main
Files fetched:
- package.json (blob SHA d7e98341eed4d99f313b03674e5a637d0d122afc)
- worker.js (blob SHA db68330bdd9215903a9a5531630d78ddafc62244)
- Code.gs (blob SHA available in GitHub fetch result; see repository history)
- cloudflare/agentSkills.js (blob SHA c389aa779fb4dc362eefe1cfbd98bd32f0abc94b)
- src/App.jsx (blob SHA c4b1d2a209d73ae4a3267d631384d92884da8778)
- src/main.jsx (blob SHA fa5203e5ad4e726079f97f359ef8d31435a4e5f7)
- scripts/assemble-api.mjs (blob SHA 4aa7b517300888ab5098cdcb8e6098c59ce5b3c9)
- README.md (blob SHA feb9b0788928860407ff81aedb4165cfad6ba52b)

Observed facts:
- package scripts include build, lint, test, and test:agent.
- PWA entry lazily loads Dashboard, Stock, Input, PO, History, Settings, Sync Queue, and AI Assistant pages.
- Worker has a read-only action allowlist and a live data gathering path.
- Worker currently defines a default Workers AI model constant and also contains a 9Router provider path; actual production environment selection must be checked separately.
- cloudflare/agentSkills.js includes a static structure knowledge block and declares getAgentKnowledge as an extra read action and manifest intent.
- Code.gs snapshot reports backend constants APP_TITLE = BACKEND GudangAI-69 V6.6.5 DEPLOY and BACKEND_VERSION = 6.6.5+DEPLOY-READY in its global configuration.
- The fetched Code.gs doPost action switch needs a complete action-to-handler inventory and explicit verification of getAgentKnowledge. Do not infer production deployment behavior from repository source.
- Static structure knowledge text labels itself V6.5.4+ while the fetched Code.gs constants identify V6.6.5+DEPLOY-READY. This version/documentation drift must be reconciled.
- README contains setup guidance that must be reviewed against current deployment/security practice; it is not authoritative proof of live configuration.

## Critical audit hypotheses — must be tested, not assumed

1. getAgentKnowledge may be allowlisted and routed by Worker but absent from the Apps Script doPost switch/handler.
2. Exact stock-code intent and parameter extraction may not reliably call getStockByCode; verify the complete current worker path and tests.
3. Transaction-history intent may map generic "barang masuk/keluar/rusak" questions to getTransactionHistory with a fixed "Barang keluar" sheet parameter; verify and correct if confirmed.
4. Worker-generated readAt may represent gateway response time, not the underlying spreadsheet read time. Distinguish source read timestamp from gateway timestamp.
5. Worker currently accepts any payload that is not success:false as successful in gatherLiveData. Validate success envelopes and expected fields per action before exposing results.
6. Static knowledge and live spreadsheet manifest may diverge; live manifest must be authoritative for current tab names/count.
7. The AI model must not be used to manufacture missing facts or substitute tool-call instructions for actual tool execution.

## Workstreams and order

### W0 — Baseline and inventory (read-only)
- Capture commit, branch, active PRs and workflow status.
- Enumerate repository tree and project entry points.
- Build PWA route/page/dependency map.
- Inventory all Worker endpoints, env binding names, AI providers, action allowlist, routing and error paths.
- Parse complete Code.gs into function/action/trigger/write/read inventory.
- Map every spreadsheet tab, headers, formula/source ownership and cross-sheet dependencies from live read-only manifest where authorized.
- Inspect Supabase tables/RLS/functions without modifying schema.
- Produce evidence ledger: verified / failed / unknown / conflicting.

### W1 — Data contract and source-of-truth map
- Define a typed response contract per read action.
- Separate sourceReadAt from gatewayReceivedAt.
- Define provenance, freshness, completeness, row identity and validation rules.
- Define entity + item-code keys and timezone normalization.
- Define partial, empty, not-found, stale, failed and conflict semantics.

### W2 — Grounded action execution
- Exact intent routing and entity/code extraction.
- Action registry cross-checked with actual Apps Script handlers.
- Fail-closed response guard.
- Per-action response validators.
- No manual action placeholder responses.
- No generic fallback that silently substitutes a different action.
- Redacted structured observability.

### W3 — Project knowledge and spreadsheet understanding
- Live manifest, tab metadata and header/schema inventory.
- Code.gs function map with call relationships.
- PWA page-to-API-to-Worker-to-Apps-Script-to-sheet flow map.
- Operational workflows and invariants.
- Versioned knowledge package with source commit and generated timestamp.
- Knowledge must be regenerated/invalidated when source files or sheet schema change.

### W4 — Agent/model evaluation
- Keep existing provider as baseline.
- Benchmark candidate models/providers on identical test cases.
- Evaluate tool routing, structured extraction, grounded answer fidelity, refusal on missing evidence, latency, cost, Indonesian language quality and availability.
- Consider one orchestrator plus specialist skills first; add multiple independent agents only if measurable benefit outweighs complexity.
- Candidate providers/models are not approved until current availability, pricing, runtime compatibility and benchmark results are verified.

### W5 — Verification and release
- Unit, contract, integration, regression, security and read-only live tests.
- Verify PWA build and Worker compatibility.
- Review all changed files and diffs.
- Keep pull request draft until every P0 gate passes.
- Explicit approval required before merge or production deployment.
- Post-deploy smoke test and rollback plan required for release.

## Model/agent architecture decision criteria

Prefer a single orchestrator with deterministic tool execution and modular skills as the initial architecture. A specialist agent may be added for a bounded domain (e.g. spreadsheet/code analysis, stock analysis, transaction audit, purchasing) only when:
- its data/tools are explicitly scoped;
- outputs follow a shared evidence contract;
- it cannot bypass authorization or read-only controls;
- it passes the same acceptance tests;
- it improves measured quality, latency or cost.

Do not add agents merely to increase the number of models. More agents increase orchestration, disagreement, latency, cost and failure surface.

## Required evidence ledger format

For every finding record:
- ID
- component and file/line or sheet/tab/column
- observed behavior
- source evidence and version/time
- status: VERIFIED / FAILED / UNKNOWN / CONFLICT
- impact and severity
- proposed correction
- test proving correction
- production deployment status (separate from repository status)

## Definition of done

- All relevant project files and entry points inventoried.
- Every spreadsheet tab and relevant schema verified against live read-only source.
- Every Code.gs action mapped to a real handler and data source.
- PWA-to-Worker-to-Apps-Script-to-Sheets data flows documented.
- No unverified live claim can pass the response guard.
- All critical action contracts and regression tests pass.
- Candidate model comparison documented with reproducible results.
- Build, CI and read-only live tests pass.
- No unresolved P0/P1 data-integrity or security defects.
- Deployment status is independently verified; no claim of production completion from a repository commit alone.

## Current status

AUDIT NOT COMPLETE.
No production resources changed by this project charter.
No model/provider switch approved.
No merge or deployment approved.
