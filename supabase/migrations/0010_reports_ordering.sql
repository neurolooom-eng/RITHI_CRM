-- ===========================================================================
-- Reports ordering. `public.reports` has no `created_at` column — the visit
-- history is ordered by `visit_at` (newest visit first), with the identity
-- `id` as the tiebreaker for rows that share a date or have none. These
-- indexes back that sort so the register and the per-call/per-UCN lookups
-- stay fast. Run in the Supabase SQL Editor as postgres.
-- ===========================================================================

create index if not exists reports_visit_at_idx on public.reports (visit_at desc nulls last, id desc);
create index if not exists reports_call_number_idx on public.reports (call_number);
