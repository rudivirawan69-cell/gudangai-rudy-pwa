# Agent Rubee — Full Knowledge Integration

## Design

Agent Rubee receives two distinct knowledge channels:

1. **Code knowledge index** — generated from the complete repository `Code.gs` snapshot by `scripts/build-agent-knowledge.mjs`. The build stores the source hash, backend version, line/character counts, and overlapping searchable chunks in `cloudflare/generated/code-knowledge.js`. Worker retrieval ranks the most relevant chunks per question; it does not put the full 200 KB source file into every model prompt.
2. **Live spreadsheet knowledge** — Apps Script action `getAgentKnowledge` provides:
   - `mode: manifest`: all sheet names, IDs, dimensions, hidden flags, and only the known safe header rows; it never samples transaction rows.
   - `mode: search`: bounded cross-sheet text search with row values, matched cell, and optional formula text.
   - `mode: page`: bounded page retrieval for a named sheet, with optional formulas and independent next-row/next-column cursors.

## Limits and provenance

- Search returns at most 40 matching rows (Worker asks for 24).
- Page mode returns at most 50 rows and 30 columns; Worker requests 30 rows for explicit page questions.
- Worker still performs no more than two Apps Script reads per agent question.
- The prompt's live-data budget is 9,000 characters; the Code.gs retrieval budget is 6,500 characters. If a result is clipped, the model must say so.
- Every response carries `dataSources` and `knowledgeSources`; Code.gs source provenance includes backend version, source hash, and GitHub ref.
- Code.gs from GitHub is a repository snapshot. It is not proof of the deployed Apps Script version. The live spreadsheet data is separately timestamped by Apps Script.

## Security

- The action is read-only and is allowlisted in the Cloudflare Worker.
- It uses the existing Supabase bearer-token verification and server-side Apps Script secret.
- No arbitrary Apps Script function name is accepted.
- `Config` and `System Log` are excluded from generic search/page reads; their values and headers are not returned by the manifest. Safe configuration metadata remains available through `getConfig`.
- Formula retrieval is opt-in.
- Existing transaction, PO-write, period-change, setup, and admin actions remain rejected by the Worker read-only allowlist.

## Release sequence

1. CI checks Worker and Apps Script syntax, generates the Code.gs index, runs agent tests, and builds the PWA.
2. Merge the PR to `main`; the canonical Cloudflare workflow deploys the Worker and PWA.
3. Separately update and deploy the Apps Script Web App using the revised repository `Code.gs`. This is required before `getAgentKnowledge` can return live spreadsheet manifests, searches, or pages.
4. Verify `/api/agent/health` reports `codeKnowledgeIndexed: true`, then test `getAgentKnowledge` with a Supabase-authenticated operator session.

## Important boundary

This is on-demand retrieval and a searchable index, not continuous mirroring of every cell into the model. For large tabs, the agent must use search or page cursors to fetch relevant ranges. No spreadsheet write capability is added.
