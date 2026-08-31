-- ===========================================================================
-- Calls / reports read at scale — stop re-deriving the reporting tree per row.
--
-- can_see_call(allottee) wraps `allottee in (select ... visible_engineer_names())`
-- in a scalar function that takes the per-row allocation as its argument. Because
-- the argument changes per row, the planner treats the whole function as a black
-- box and evaluates it — including the RECURSIVE tree walk inside
-- visible_engineer_names() — once for EVERY call row. At 15–18k PM calls a year
-- (and their reports) that is "canceling statement due to statement timeout" on
-- Pending Calls and Reports. 0014 removed this cost once; 0034 folding the office
-- bypass back through can_see_call reintroduced it.
--
-- The fix is not new logic, only new SHAPE: inline the visibility test into the
-- policy so the tree set is an uncorrelated sub-select — an InitPlan Postgres
-- builds ONCE per query and hash-probes per row — and wrap the no-arg auth
-- helpers in (select …) so they are evaluated once too (the Supabase RLS
-- performance pattern). Same rows are visible to the same people; only the plan
-- changes. can_see_call() itself is left in place for callers not on the hot path.
-- ===========================================================================

-- ---- calls: read + update --------------------------------------------------
drop policy if exists calls_scoped_read on public.calls;
create policy calls_scoped_read on public.calls for select
  using (
    (select public.has_perm('calls.view'))
    and (
      (select public.can_view_all_calls())
      or created_by = (select auth.uid())
      or coalesce(allocated_to, '') = ''
      or lower(trim(allocated_to)) in (
           select lower(trim(n)) from public.visible_engineer_names() as v(n)
         )
    )
  );

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update
  using (
    (select (public.has_perm('calls.edit') or public.has_perm('calls.report')))
    and (
      (select public.can_view_all_calls())
      or created_by = (select auth.uid())
      or coalesce(allocated_to, '') = ''
      or lower(trim(allocated_to)) in (
           select lower(trim(n)) from public.visible_engineer_names() as v(n)
         )
    )
  )
  with check (
    (select (public.has_perm('calls.edit') or public.has_perm('calls.report')))
    and (
      (select public.can_view_all_calls())
      or created_by = (select auth.uid())
      or coalesce(allocated_to, '') = ''
      or lower(trim(allocated_to)) in (
           select lower(trim(n)) from public.visible_engineer_names() as v(n)
         )
    )
  );

-- ---- reports: read (visible with the parent call) --------------------------
-- The recursive set is uncorrelated, so it stays an InitPlan (once); the only
-- per-report work is the indexed lookup of its call by ucn.
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select
  using (
    (select public.is_admin())
    or (
      (select public.has_perm('calls.view'))
      and (
        (select public.can_view_all_calls())
        or exists (
          select 1 from public.calls c
           where c.ucn = reports.ucn
             and (
               coalesce(c.allocated_to, '') = ''
               or lower(trim(c.allocated_to)) in (
                    select lower(trim(n)) from public.visible_engineer_names() as v(n)
                  )
             )
        )
      )
    )
  );
