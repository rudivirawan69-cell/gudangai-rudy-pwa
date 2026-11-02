# GudangAI RUDY — Three-Mode Visual System

Date: 2026-11-03

## Intent
Bring the operational PWA to a consistent, high-contrast visual system across Ocean Glass Light, Deep Ocean Dark, and Graphite / Midnight. Improve scanability of Home operations, Data Stock summaries and division cards, charts, badges, buttons, and overlays on mobile.

## Goals
- Use semantic CSS tokens for page, surface, surface-soft, border, primary text, muted text, accent, category accents, and status colors in all three modes.
- Keep the existing four Home destinations and their actual local/navigation behavior.
- Keep the existing seven-day movement chart and improve contrast without changing its data or calculations.
- Keep the six Data Stock summary cards and existing division/item data; add clear category icons and stronger division-card hierarchy.
- Keep the global app header sticky and remove the per-tab subtitle row under the product title.
- Make modal/overlay surfaces and controls theme-aware where those UI elements already exist.

## Non-goals and safety boundaries
- No Code.gs, Apps Script, API contract, Sheets/Calendar integration, database, authentication, queue, stock calculation, PO logic, or transaction changes.
- No invented live data for off schedules, meeting agendas, project progress, delivery manifests, or additional-order counts.
- Do not label a route or local checklist as a live integrated workflow unless its source is already implemented and verified.
- No production deployment as part of this change.

## Approaches considered
1. Replace the theme system wholesale — rejected because it risks breaking stored theme IDs and unrelated page styles.
2. Add semantic CSS tokens over existing theme IDs and update only the affected React presentation — selected because it preserves saved preferences and business behavior.
3. Add new backend-fed cards and connectors — rejected because the requested scope is visual-only and those data sources are not verified in the current app.

## Selected implementation
- Preserve theme IDs `soft_light`, `deep_ocean`, and `graphite_titanium`; change the third theme's visible label and palette to Graphite / Midnight dark.
- Add reusable semantic tokens and theme-aware card, badge, icon, chart, modal, and input styles.
- Keep Home cards mapped to existing navigation and local checklist/note features; display truthful action labels and no fabricated counters.
- Retain Data Stock's six-card layout and division grouping; add Lucide category icons based on existing division labels.
- Remove the tab subtitle from the shared header while preserving title, connection state, clock, and existing profile controls.

## Acceptance criteria
- All three modes use the specified backgrounds/surfaces/text/borders and category/status accents.
- Text, borders, icon backgrounds, badges, charts, and overlays remain distinguishable at mobile width.
- Home retains four actionable cards and the 7-day chart; actions do not create new backend writes.
- Data Stock retains six cards and all current division/item interactions; division icons are descriptive and consistent.
- Header remains sticky and no page-specific subtitle appears below the product title.
- Build and lint pass; verify no backend/API/Code.gs files changed.
