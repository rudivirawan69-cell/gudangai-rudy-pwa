# GudangAI RUDY — UI/UX Workflow

## Status

- Feature branch: `uiux/global-design-system-preview-20261119`
- Draft PR: https://github.com/rudivirawan69-cell/gudangai-rudy-pwa/pull/181
- Figma design system: https://www.figma.com/design/71Dfh4x0CkJcIZyPyBlQ3L
- Preview Worker: `gudangai-rudy-pwa69-uiux-preview`
- Preview URL: https://gudangai-rudy-pwa69-uiux-preview.rudivirawan69.workers.dev/
- Production Worker: `gudangai-rudy-pwa-69` — unchanged by this workflow

## Three-tool workflow

1. **Figma** — define tokens, theme palettes, component anatomy, states, responsive behavior and design review.
2. **GitHub** — implement the approved design on a `uiux/*` feature branch, review the diff and run CI in a Pull Request to `main`.
3. **Cloudflare Preview** — build and deploy the PR to the dedicated UIUX Preview Worker. Review on Android and desktop before approval.

## Required GitHub Preview environment

Create or configure GitHub repository environment `uiux-preview` and add these environment secrets:

- `CLOUDFLARE_API_TOKEN` — a dedicated token limited to deploying Workers scripts/assets for this account.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID.

Do not copy Apps Script, Supabase service-role, or production Worker runtime secrets into this environment. The Preview job intentionally uses a separate GitHub environment instead of the existing `production` environment.

## Preview safety boundary

The preview build sets `VITE_UIUX_PREVIEW=true`. The imported `src/uiux-preview-guard.js` then:

- displays a persistent **PREVIEW · READ ONLY** banner;
- permits Apps Script GET/HEAD requests for display data;
- blocks non-read requests to `script.google.com` and `script.googleusercontent.com` through Fetch, XMLHttpRequest and `sendBeacon`;
- returns an explicit `UIUX_PREVIEW_READ_ONLY` failure instead of silently pretending a transaction succeeded.

The Preview Worker is a separate static-assets Worker. It does not use `wrangler.jsonc`, the production Worker name, production deployment secrets for Apps Script, or production routes. The existing production workflow remains unchanged and its deploy job is restricted to pushes on `main`.

## Review gates

- [ ] Figma tokens and component variants reviewed
- [ ] Three themes checked: `soft_light`, `deep_ocean`, `graphite_titanium`
- [ ] Mobile Android layout checked
- [ ] Tablet and desktop layout checked
- [ ] Contrast, typography, spacing and focus states checked
- [ ] Loading, empty, error and disabled states checked
- [ ] Preview read-only guard verified
- [ ] No changes to Code.gs, Sheets, transaction rules, API contracts or Supabase configuration
- [ ] User explicitly approves the PR

**Production rule:** no merge to `main`, no production Worker deployment and no production configuration change until the user explicitly approves the final PR. A successful Preview deployment is not production approval.

## Figma Starter-plan note

Figma Starter permits one mode per variable collection. The initial foundations therefore use separate collections for the three themes rather than relying on a multi-mode collection. The Foundations page contains the initial theme palette overview. Reusable component sets are the next Figma construction stage.
