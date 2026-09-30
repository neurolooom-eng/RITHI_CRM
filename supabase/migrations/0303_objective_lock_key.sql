-- ===========================================================================
-- LOCKING THE OBJECTIVE CUT-OFF IS objective.lock.
-- WHAT WAS AN ADMINISTRATOR'S ALONE IS A KEY (the user, 2026-09-30: "All
-- Admin Actions that are greyed out now should be editable from the Role &
-- Permissions. Only the Admin Role should be Greyed out not the Actions.")
--
-- is_admin() becomes has_perm(<key>). An administrator still passes -- has_perm()
-- answers true for is_admin() -- so nobody loses anything, and NOBODY ELSE GAINS
-- ANYTHING ON THE DAY: no role holds the new key until an administrator ticks it
-- on Roles & Permissions. coalesce(..., false) so a NULL (no session) refuses.
--
-- The lock, the guard that honours it, and the per-month setter all asked
-- is_admin(). objective.manage is still NOT what unlocks it: that is the
-- audience the lock exists to hold back.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_objective_cutoff_lock(p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not coalesce(public.has_perm('objective.lock'), false) then
    raise exception 'RBAC: locking or unlocking the objective cut-off needs "Lock or unlock the objective cut-off"';
  end if;
  insert into public.app_settings (key, value, updated_at)
       values ('objective_cutoff_locked', case when p_on then 'on' else 'off' end, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return p_on;
end $function$;

CREATE OR REPLACE FUNCTION public.quality_objectives_cutoff_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.objective_cutoff_locked() then return new; end if;
  if coalesce(public.has_perm('objective.lock'), false) then return new; end if;
  if (old.calc_params->>'cutoff_date') is distinct from (new.calc_params->>'cutoff_date')
     or (old.calc_params->>'cutoff_days') is distinct from (new.calc_params->>'cutoff_days') then
    raise exception 'The objective cut-off is locked. A holder of "Lock or unlock the objective cut-off" can unlock it on the Objective page.';
  end if;
  return new;
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
     and not coalesce(public.has_perm('objective.lock'), false) then
    raise exception 'The objective cut-off is locked. A holder of "Lock or unlock the objective cut-off" can unlock it on the Objective page.';
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
