-- ===========================================================================
-- 0402 — A QUALITY OBJECTIVE THAT CARRIES A FIGURE IS NOT DELETED
--        (second re-review D-021, FRS-121.7)
--
-- Quality Objectives deleted an objective with its twelve figures after a
-- browser confirm, and qo_write (FOR ALL) allowed it to objective.manage. A
-- monthly figure is the record that the objective was measured; deleting the
-- row erased the measurement with it. FRS-121.7: the database shall refuse to
-- delete an objective that carries any recorded figure -- a month m01..m12 or
-- the Total. An objective added in error, with nothing recorded yet, can still
-- be deleted. 0396 images every change and delete in record_audit.
-- Not stopped: a connection with no session and a function running as its
-- owner (a repair in the SQL editor).
-- In the objective module, last.
-- ===========================================================================

create or replace function public.quality_objective_keeps_figures()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return old; end if;
  if current_user <> 'authenticated' then return old; end if;
  if num_nonnulls(old.m01, old.m02, old.m03, old.m04, old.m05, old.m06,
                  old.m07, old.m08, old.m09, old.m10, old.m11, old.m12, old.total) > 0 then
    raise exception '% (%) carries recorded figures and is kept -- clear the figures first if it was added in error',
      old.parameter, old.year using errcode = '23514';
  end if;
  return old;
end $$;
revoke execute on function public.quality_objective_keeps_figures() from public, anon, authenticated;
drop trigger if exists quality_objective_keeps_figures on public.quality_objectives;
create trigger quality_objective_keeps_figures
  before delete on public.quality_objectives
  for each row execute function public.quality_objective_keeps_figures();
