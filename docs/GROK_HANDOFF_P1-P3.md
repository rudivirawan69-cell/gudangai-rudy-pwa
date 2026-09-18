# Grok AI Handoff — GudangAI P1→P3

## Current implementation
Development branch: `p1-p3-v6.7-final`
PR: #22
Base: `main`
Branch head: `d5ad61bcfa302cdc545c2221c6de50e134fdd729`

The P1→P3 implementation is complete on the development branch. Do not overwrite stable business logic merely to resolve the merge.

## Critical merge issue
PR #22 currently reports `mergeable=false` / `mergeable_state=dirty` because `main` advanced after the V6.6.4 predeploy branch was created.

Resolve the merge as a three-way merge:
- keep the newer `main` visual/page changes,
- port only the P1/P2/P3 reliability additions,
- preserve all V6.6.4 input/timeout/readback/idempotency changes already present in the branch,
- do not delete camera/photo/paste features from main,
- do not modify backend business rules.

## Files whose P1/P3 additions must survive
- `src/data/api.js`: adaptive write timeout, durable queue mirror, circuit breaker, request coalescing, stale stock cache, 8→15 stability promotion, timeout reconciliation.
- `src/data/offlineStore.js`: IndexedDB durable queue.
- `src/pages/InputPage.jsx`: server validation hard gate, queued/HOLD messaging, circuit breaker UI.
- `src/pages/SyncQueuePage.jsx`: live queue/circuit state and safe retry wording.
- `src/App.jsx`: hydrate IndexedDB queue once.
- `public/manifest.json`: PNG maskable icons.
- `public/sw.js`: precache icons/cache version.
- `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`: real PNG assets.
- `package.json`, `.github/workflows/webpack.yml`, `scripts/validate_p1p3.mjs`: completion gate.
- `docs/P1-P3-COMPLETION.md`: test and DoD contract.

## Do not change
- CV/PT business semantics.
- Official transaction sheet names.
- Dashboard PO date detection row 4, table header row 5, data row 6.
- Backend V6.6.4 transaction/idempotency/HOLD logic.
- Spreadsheet write-once semantics.
- Existing stable UI layout unless necessary to resolve a merge conflict.

## Remaining external checks
1. Deploy backend V6.6.4, run batch 15–20 and 40 keluar, verify no duplicate and verify Idempotency Ledger/readback.
2. Real Chrome Android: photo OCR across lighting/angle/blur cases.
3. Paste-text test against real warehouse recap formats; maintain >90% matching target.
4. Dashboard PO current/previous period + donut after backend deployment.
5. TWA/APK requires package ID + signing SHA-256 + release keystore before assetlinks/signing can be completed.

## Vercel status
The current GitHub status returned Vercel checks pointing to `upgradeToPro=build-rate-limit`, while Vercel deployment status remains pending. Treat this as a deployment/platform quota gate, not proof of a source-code build error. Vercel Git integration supports automatic deployment from GitHub branches/PRs, but deployment availability is still subject to the connected team's limits.

## Final acceptance
Do not call production-ready until:
- validate_p1p3 passes,
- lint passes,
- Vite build passes,
- Vercel preview is healthy,
- V6.6.4 backend tests pass,
- Android photo/paste field test passes,
- no unexplained duplicate/UNKNOWN write remains.
