-- ===========================================================================
-- "canceling statement due to statement timeout" — the Hand Stock screen.
--
-- Not the derivation: with row-level security off the whole movement history
-- (103,000 rows) counts in 98 ms and the balance page in 471 ms. With it ON,
-- 11-14 SECONDS. The plan says why:
--
--   Seq Scan on spare_issue_history (actual time=1.756..3948.092 rows=48139)
--     Filter: (has_perm('consumption.reconcile') OR has_perm('spare.dispatch')
--              OR $0 OR $1 OR (hashed SubPlan 3))
--
-- `$0`, `$1` and the SubPlan are InitPlans — evaluated ONCE, because those
-- clauses are written `(select f())`. The two bare `has_perm(...)` calls are
-- not: they run PER ROW. 48,139 rows x 2 calls ≈ 3.9 s on one table, and the
-- view unions two more of that size.
--
-- They come from the `for all` write policies. A FOR ALL policy's USING clause
-- applies to SELECT as well, so every read paid for them.
--
-- Wrapping a call in `(select ...)` makes it an InitPlan: same answer, computed
-- once. Only calls whose arguments do NOT depend on the row are wrapped —
-- `can_see_call(allocated_to)` and `is_spare_requester(spare_requests)` must
-- stay per-row, because that is the question they answer.
-- ===========================================================================

drop policy if exists sih_write on public.spare_issue_history;
create policy sih_write on public.spare_issue_history for all
  using ((select public.has_perm('consumption.reconcile')) or (select public.has_perm('spare.dispatch')))
  with check ((select public.has_perm('consumption.reconcile')) or (select public.has_perm('spare.dispatch')));

drop policy if exists sch_write on public.spare_consumption_history;
create policy sch_write on public.spare_consumption_history for all
  using ((select public.has_perm('consumption.reconcile')) or (select public.has_perm('spare.dispatch')))
  with check ((select public.has_perm('consumption.reconcile')) or (select public.has_perm('spare.dispatch')));

drop policy if exists hso_write on public.handstock_opening;
create policy hso_write on public.handstock_opening for all
  using ((select public.has_perm('consumption.reconcile')) or (select public.has_perm('spare.dispatch')))
  with check ((select public.has_perm('consumption.reconcile')) or (select public.has_perm('spare.dispatch')));

-- The same, on the three the movement view also reads. `sd_read` had THREE bare
-- calls per row; `sdl_write` is a FOR ALL whose USING was paying on every read.
drop policy if exists sdl_write on public.spare_dispatch_lines;
create policy sdl_write on public.spare_dispatch_lines for all
  using ((select public.has_perm('spare.dispatch')))
  with check ((select public.has_perm('spare.dispatch')));

drop policy if exists sd_read on public.spare_dispatches;
create policy sd_read on public.spare_dispatches for select
  using (
    (select public.is_admin())
    or created_by = (select auth.uid())
    or (select public.has_perm('spare.dispatch'))
    or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n))
  );
