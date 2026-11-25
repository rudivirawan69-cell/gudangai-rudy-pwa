# Rubee Intelligence — Supabase Read-only Audit 03

Audit date: 2026-11-25
Project: GUDANGAI69
Project ref: cbeosysruwkfwgklziog
Status: live metadata/schema/security read-only inspection; no schema or data mutation.

## Verified project state
- Project status: ACTIVE_HEALTHY.
- Region: ap-southeast-2.
- PostgreSQL engine: 17 (reported database version 17.11.0.002).
- Public schema tables returned by list_tables(verbose=true): 2.

## Tables
### public.agent_memories
- RLS enabled.
- Columns: id (uuid PK), user_id (uuid FK to auth.users.id), title (text, 1–120 chars), content (text, 1–2400 chars), kind (text constrained to idea/decision/learning/follow_up), created_at (timestamptz).
- Reported row count: 0 at audit time.
- Policies verified by read-only pg_policies query:
  - SELECT authenticated where auth.uid() = user_id.
  - INSERT authenticated with check auth.uid() = user_id.
  - DELETE authenticated where auth.uid() = user_id.
  - No UPDATE policy was returned.
- Three performance advisor warnings note auth.uid() evaluation in these policies should be wrapped as (select auth.uid()) to avoid per-row re-evaluation at scale. This is a performance optimization, not a current access-control bypass finding.

### public.audit_logs
- RLS enabled.
- Columns: id (bigint identity PK), user_id, user_email, user_role, action, details (jsonb), created_at.
- Reported row count: 0 at audit time.
- Security advisor reports RLS enabled but no policies exist.
- This may intentionally block client access; determine intended writer/reader model before adding any policy. Do not create broad client policies.
- An unused-index advisor finding exists for agent_memories_user_created_idx.

## Edge Functions and migrations
- Supabase Edge Functions list returned empty.
- Migrations reported:
  - 20261103221347 create_audit_logs_table
  - 20261118083217 create_agent_memories
  - 20261118083324 verify_agent_memories
  - 20261118083518 verify_agent_memories

## Security/performance advisors
- Security:
  - INFO: public.audit_logs has RLS enabled with no policies.
  - WARN: Auth leaked-password protection is disabled; recommended to enable in Supabase Auth settings.
- Performance:
  - WARN: three agent_memories RLS policy initplan warnings.
  - INFO: unused index agent_memories_user_created_idx.
- Advisor observations were timestamped 2026-11-25T10:37Z.

## Interpretation
- Supabase project is active and healthy at metadata-check time.
- The agent memory table has user-scoped SELECT/INSERT/DELETE policies; no UPDATE policy observed.
- The audit_logs table is inaccessible through ordinary RLS-governed client queries unless an authorized backend/service role path is used. Confirm intended behavior before changes.
- No Edge Functions currently appear in the project, so AI agent orchestration is currently in Cloudflare Worker rather than Supabase Edge Functions, based on the inspected project function list.
- These findings do not prove application auth works end-to-end; Worker token validation and client session behavior still need integration tests.
- The database row counts are the tool's reported counts at audit time, not a permanent guarantee.

## Recommended actions (not executed)
1. Enable leaked-password protection after owner review.
2. Review audit_logs access model and keep RLS enabled; add only least-privilege policies or server-only access as appropriate.
3. Consider (select auth.uid()) policy optimization after validating migration plan.
4. Determine whether unused index is truly unnecessary using query workload evidence before dropping it.
5. Add schema/policy contract tests to CI.
6. Keep Supabase service-role credentials server-side only; never ship them in PWA bundles.

No Supabase migration, policy change, data write, Edge Function deployment, or project configuration change was performed.
