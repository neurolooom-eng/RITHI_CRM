-- ===========================================================================
-- 0345 — A FIGURE TYPED OVER A CALCULATED ONE IS A MANUAL OVERRIDE, AND
--        RE-CALCULATE ASKS BEFORE IT TOUCHES IT.
--
-- The user, 2026-10-04: "I still want to Edit Objectives even though they are
-- recalculated. And i Override it manually, then it should never change.. Or
-- prompt the user if Manually Overrides should be considered or discarded
-- during every re-run / re-calculate."
--
-- Until now a month of a computed (ƒ) objective could be typed over, and the
-- next Re-Calculate wrote over it again without a word (the confirm dialog
-- said so in its last line). Now:
--
--   * TYPING over a month of a computed objective marks that month in
--     `overrides` -- who, when, and the calculated figure it replaced. The
--     mark is written by the DATABASE (trigger below), never taken from the
--     caller, so it cannot be forged or quietly removed through the API.
--   * Re-Calculate takes a choice, p_keep_overrides. KEEP (the default, and
--     what the old one-argument call now does) leaves every overridden month
--     exactly as typed, every run, for ever. DISCARD writes the calculated
--     figure over them and removes the marks. The screen asks which, on every
--     run that finds an override.
--   * A typed objective (no calc_key) is untouched as before: every figure on
--     it is typed, so none of them is an "override".
--
-- HOW THE TRIGGER TELLS RE-CALCULATE FROM A PERSON: the function sets the
-- transaction-local setting rithi.objective_recalc for its own writes. The API
-- cannot set it -- set_config lives in pg_catalog, which PostgREST does not
-- expose -- so a person's edit is always a person's edit.
-- ===========================================================================

alter table public.quality_objectives
  add column if not exists overrides jsonb not null default '{}'::jsonb;

comment on column public.quality_objectives.overrides is
  'Months of a computed objective typed over by hand: {"m03": {"by": email, "at": timestamp, "calculated": the figure it replaced}}. Written only by quality_objectives_mark_override(); Re-Calculate keeps these months unless told to discard them (0345).';

create or replace function public.quality_objectives_mark_override()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m   integer;
  k   text;
  o   jsonb;
  n   jsonb;
begin
  -- Re-Calculate's own writes: it manages the marks itself.
  if coalesce(current_setting('rithi.objective_recalc', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.overrides := '{}'::jsonb;
    return new;
  end if;
  -- The marks are the database's: whatever the caller sent is ignored.
  new.overrides := coalesce(old.overrides, '{}'::jsonb);
  if coalesce(old.calc_key, '') = '' or coalesce(new.calc_key, '') = '' then
    return new;
  end if;
  o := to_jsonb(old);
  n := to_jsonb(new);
  for m in 1..12 loop
    k := 'm' || lpad(m::text, 2, '0');
    if (n -> k) is distinct from (o -> k) then
      new.overrides := new.overrides || jsonb_build_object(k, jsonb_build_object(
        'by', coalesce(auth.email(), ''),
        'at', now(),
        -- The figure the calculation had put there; kept from the FIRST
        -- override, so typing twice does not lose what was calculated.
        'calculated', coalesce(old.overrides -> k -> 'calculated', o -> k)));
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.quality_objectives_mark_override() from public, anon, authenticated;

drop trigger if exists zy_quality_objectives_mark_override on public.quality_objectives;
create trigger zy_quality_objectives_mark_override before insert or update on public.quality_objectives
  for each row execute function public.quality_objectives_mark_override();

-- ---------------------------------------------------------------------------
-- RE-CALCULATE, WITH THE CHOICE. 0292's body, plus: the override months are
-- skipped (kept) or recalculated and unmarked (discarded). months_kept says
-- how many were left alone.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_quality_objectives(p_year integer, p_keep_overrides boolean)
returns table (objective text, months_written integer, months_kept integer)
language plpgsql security definer set search_path = public as $$
declare
  o   public.quality_objectives;
  p   record;
  m   integer;
  k   text;
  v   numeric;
  n   integer;
  kept integer;
  ovr boolean;
begin
  if not coalesce(public.has_perm('objective.manage'), false) then
    raise exception 'RBAC: only an administrator can re-calculate the objectives';
  end if;
  perform set_config('rithi.objective_recalc', 'on', true);

  for o in select * from public.quality_objectives
            where year = p_year and calc_key <> '' order by sort_order loop
    n := 0; kept := 0;
    for m in 1..12 loop
      k := 'm' || lpad(m::text, 2, '0');
      ovr := coalesce(o.overrides, '{}'::jsonb) ? k;
      if ovr and coalesce(p_keep_overrides, true) then
        kept := kept + 1;
        continue;
      end if;
      select * into p from public.objective_period(o.id, m);
      if found and p.applies then
        v := public.objective_value(o.id, m);
        -- A discarded override takes the calculated figure even when that is
        -- "nothing to measure": leaving the typed number in place, unmarked,
        -- would read as calculated when it is not.
        if v is not null or ovr then
          execute format('update public.quality_objectives set %I = $1 where id = $2', k)
            using v, o.id;
          if v is not null then n := n + 1; end if;
        end if;
      elsif found and public.objective_is_quarterly(o.frequency) then
        execute format('update public.quality_objectives set %I = null where id = $1', k)
          using o.id;
      end if;
      if ovr then
        update public.quality_objectives set overrides = overrides - k where id = o.id;
      end if;
    end loop;
    objective := o.parameter; months_written := n; months_kept := kept;
    return next;
  end loop;
  perform set_config('rithi.objective_recalc', '', true);
end $$;
revoke all on function public.recalc_quality_objectives(integer, boolean) from public, anon;
grant execute on function public.recalc_quality_objectives(integer, boolean) to authenticated;

-- The one-argument call KEEPS the overrides -- the safe answer for anything
-- that does not ask. Same result shape as before, so nothing calling it changes.
create or replace function public.recalc_quality_objectives(p_year integer)
returns table (objective text, months_written integer)
language sql security invoker set search_path = public as $$
  select r.objective, r.months_written from public.recalc_quality_objectives(p_year, true) r;
$$;
revoke all on function public.recalc_quality_objectives(integer) from public, anon;
grant execute on function public.recalc_quality_objectives(integer) to authenticated;
