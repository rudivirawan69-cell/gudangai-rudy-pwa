# Implementation Plan — GudangAI Three-Mode Visual System

Spec: `docs/superpowers/specs/2026-11-03-gudangai-three-mode-visual-system.md`
Branch: `ui/visual-refresh-nov-2026`

## Global constraints
- Frontend presentation only.
- Do not modify Code.gs, API modules, transaction flows, stock formulas, PO state, queues, auth, or integrations.
- Preserve existing theme IDs and local storage keys.
- Do not invent operational data or unverified action handlers.

## Task 1 — Theme token foundation
Files: `src/ui-visual-refresh.css`, `src/hooks/useTheme.jsx`, `src/pages/SettingsPage.jsx`
- Define semantic tokens for all three palettes: page, surface, soft surface, border, ink, muted, accent, category accents and soft category backgrounds, safe/warning/critical foregrounds and soft backgrounds.
- Change graphite_titanium visible name and description to Graphite / Midnight; retain its ID.
- Add theme-safe global card, badge, button, modal, form and icon styles.
Acceptance: all three data-theme selectors define the complete semantic token set; no theme ID or storage key changes.

## Task 2 — Home presentation
Files: `src/pages/DashboardPage.jsx`, `src/App.jsx`, `src/ui-visual-refresh.css`
- Keep the four existing action destinations and local-only behavior; clarify action labels and add truthful category badges without fake counts.
- Add time-aware greeting/reminder copy using current local time only; no schedule or API changes.
- Keep the 7-day chart and recolor its existing SVG/labels using semantic tokens.
- Keep header title/status and sticky behavior; remove the tab subtitle row.
Acceptance: four cards remain actionable; chart remains data-identical; no new backend calls.

## Task 3 — Data Stock presentation
Files: `src/pages/StokPage.jsx`, `src/ui-visual-refresh.css`
- Preserve six summary cards and all current filters and stock calculations.
- Add modern Lucide icons by existing division name and improve card hierarchy, icon surface, count chips and item rows.
- Keep CV/PT selection and item expansion behavior.
Acceptance: all divisions and items remain visible/accessible; no stock computation changes.

## Task 4 — Verification and review
- Run lint and production build.
- Inspect diff and assert only approved frontend files plus design documentation changed.
- Verify Code.gs/API/backend files are absent from the diff.
- Review theme selectors and responsive classes for all three modes.
- Do not merge or deploy; report preview/CI state separately.
