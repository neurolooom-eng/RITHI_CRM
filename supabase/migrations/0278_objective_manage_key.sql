-- ===========================================================================
-- 0278 — THE OBJECTIVE SCREEN HAS A KEY OF ITS OWN
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0284) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0272, public.perm_parents).
--
-- This file: quality objectives were edited, recalculated and cut off under
-- config.manage, which the Objective row did not show. Now objective.manage.
-- Locking a month stays an administrator's (shown greyed on the matrix).
-- ===========================================================================

drop policy if exists qo_write on public.quality_objectives;
create policy qo_write on public.quality_objectives for all
  using (public.has_perm('objective.manage')) with check (public.has_perm('objective.manage'));

CREATE OR REPLACE FUNCTION public.recalc_quality_objectives(p_year integer)
 RETURNS TABLE(objective text, months_written integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o   public.quality_objectives;
  p   record;
  m   integer;
  v   numeric;
  n   integer;
begin
  if not coalesce(public.has_perm('objective.manage'), false) then
    raise exception 'RBAC: only an administrator can re-calculate the objectives';
  end if;

  for o in select * from public.quality_objectives
            where year = p_year and calc_key <> '' order by sort_order loop
    n := 0;
    for m in 1..12 loop
      select * into p from public.objective_period(o.id, m);
      if found and p.applies then
        v := public.objective_value(o.id, m);
        if v is not null then
          execute format('update public.quality_objectives set %I = $1 where id = $2',
                         'm' || lpad(m::text, 2, '0'))
            using v, o.id;
          n := n + 1;
        end if;
      elsif found and public.objective_is_quarterly(o.frequency) then
        execute format('update public.quality_objectives set %I = null where id = $1',
                       'm' || lpad(m::text, 2, '0'))
          using o.id;
      end if;
    end loop;
    objective := o.parameter; months_written := n;
    return next;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.set_objective_cutoff(p_year integer, p_month integer, p_date date)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- coalesce, NOT a bare `if not has_perm(...)`. `my_extra_perms()` returns NULL
  -- when there is no signed-in user, which makes has_perm() NULL -- and
  -- `if not NULL` never fires, so the guard would fall THROUGH and the write
  -- would go ahead. Caught by a test whose fixture user did not exist; the
  -- pattern is used in fifteen other migrations and is noted in the backlog.
  -- (Not reachable from the API today: execute is granted to `authenticated`
  -- only. That is a second lock, not a reason to leave the first one open.)
  if not coalesce(public.has_perm('objective.manage'), false) then
    raise exception 'RBAC: you cannot change the objective cut-off dates';
  end if;
  if coalesce(public.objective_cutoff_locked(), false)
     and not coalesce(public.is_admin(), false) then
    raise exception 'The objective cut-off is locked. An administrator can unlock it on the Objective page.';
  end if;
  if p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'A cut-off belongs to a month between 1 and 12';
  end if;

  if p_date is null then
    delete from public.objective_cutoffs where year = p_year and month = p_month;
    return null;
  end if;

  insert into public.objective_cutoffs (year, month, cutoff_date, updated_by, updated_at)
       values (p_year, p_month, p_date, auth.uid(), now())
  on conflict (year, month) do update
    set cutoff_date = excluded.cutoff_date,
        updated_by  = excluded.updated_by,
        updated_at  = excluded.updated_at;
  return p_date;
end $function$;
