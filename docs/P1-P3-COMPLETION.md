# GudangAI RUDY — P1→P3 Development Principles & Completion Gate

## Scope
This document is the completion baseline for the post-V6.6.4 frontend hardening work. The stable backend/business rules remain unchanged: CV/PT semantics, columns D/E, PO date/header/data rows 4/5/6, write-once/idempotency behavior, and official transaction sheet names.

## P1 — Operational stability

### P1.1 PWA install assets
- Real PNG icons: 192x192 and 512x512.
- Both manifest icons are `image/png` and `maskable`.
- Apple touch icon is included.
- Service-worker precache was updated and cache version bumped.

### P1.2 Background asset
- Existing `public/assets/bg-gudangai.jpg` is 59,045 bytes, already below the 80–100 KB target.
- No lossy conversion was forced because the current asset already meets the size objective without risking visual regression.

### P1.3 Adaptive write timeout
- 1–2 items: 45s.
- 3–8 items: 90s.
- 9+ items: 120s.
- Write requests remain single-attempt so ambiguous responses are reconciled instead of blindly retried.

### P1.4 Queue/HOLD clarity
- Input page explicitly reports partial success + remaining queue.
- Timeout/unknown writes warn operators to check the spreadsheet before retrying.
- Server-side validation remains a hard gate before write.
- Queue page disables execution while the write circuit is open.

### P1.5 Surface discipline
- Existing page surfaces are retained to avoid layout regression.
- No business-function or data-flow changes were introduced solely for visual restyling.

## P2 — Input/data quality

### P2.1 Photo and pasted text
The current branch retains PDF rules and adds image OCR + camera capture + paste-text validation through the same cart/validation flow. Final Android field accuracy still requires real warehouse photos.

### P2.2 Validation contract
- Client parsing/matching produces the review cart.
- `validateImportedItems` performs a final backend validation before submission.
- Fuzzy matches remain review-only; exact code is deterministic.

### P2.3 Alias/master resilience
- Existing versioned alias configuration is retained.
- Deterministic rules remain authoritative for known ambiguous families such as Golden Farm, Bakso Ikan CIDEA/normal, and Saos Lada Hitam promo/normal.
- No speculative aliases were added without source evidence.

### P2.4 Request coalescing
- In-flight `getAllStock` requests are coalesced by entity.
- In-flight `getStatusPO` requests are coalesced globally.

### P2.5 Stock freshness
- <60s cache: return immediately.
- 60s–10m: return stale value immediately and refresh in background.
- >10m: wait for revalidation.
- Successful writes invalidate the stock cache.

## P3 — Resilience

### P3.1 Durable offline queue
- localStorage remains the fast UI queue.
- IndexedDB stores a versioned durable mirror.
- Revision numbers prevent an older cache from resurrecting an intentionally cleared queue.
- Queue updates emit a single `gudangai-queue-changed` event.

### P3.2 Write circuit breaker
- 3 transient/unknown write failures open the circuit.
- Cooldown: 60s.
- After cooldown, failure count is reset before counting a new failure.
- Success clears the circuit.
- UI polls circuit state once per second while the page is open so the button automatically re-enables after cooldown.

### P3.3 Dynamic batch size
- Starts at 8.
- After 5 clean successful batch chunks, local stability state promotes future chunks to 15.
- Any transient/unknown batch failure resets the promotion counter.
- This is a device-local safety heuristic, not proof of production-wide capacity.

### P3.4 Android install path
TWA packaging is not hard-coded into the web app because Android package name, signing certificate SHA-256, and release keystore are required. These must be supplied externally before `assetlinks.json` and APK signing can be made deterministic.

## Automated completion gate
`npm run validate:p1p3` checks:
1. PNG files exist, are non-trivial, are valid PNG, and have exact dimensions.
2. Manifest has maskable PNG icons.
3. Service worker precaches icon assets.
4. Adaptive timeout, circuit breaker, IndexedDB queue, stock cache, and request coalescing are present.
5. Input validation gate and queue/circuit UI wiring are present.
6. Alias config is versioned.
The CI workflow then runs `npm run lint` and `npm run build`.

## External verification still required

### Required on real Chrome Android
- Photograph actual warehouse recap sheets in bright/medium/low light.
- Test angled paper, blur, folded paper, shadows, handwriting/printed mix.
- Test paste text from the exact recap formats used by operators.
- Verify item matching accuracy remains above the operational target before writing.
- Verify camera permission denial/retry flow.

### Required against deployed V6.6.4 backend
- Batch 15–20.
- Batch 40 keluar.
- Verify Idempotency Ledger.
- Verify timeout → readback → queue never duplicates.
- Verify HOLD behavior.
- Verify Status PO current/previous period and donut after refresh.

### Required for TWA/APK
- Android package/application ID.
- Signing certificate SHA-256.
- Production domain used by TWA.
- Signed release build and Play/App distribution test.

## Definition of done
A stage is considered production-ready only when:
- automated validation passes,
- lint passes,
- Vite build passes,
- deployed browser verification passes,
- backend write tests pass,
- real Android photo/paste tests pass,
- and no unexplained duplicate or ambiguous-write remains.
