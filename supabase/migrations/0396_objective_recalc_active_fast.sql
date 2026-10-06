-- ===========================================================================
-- 0396  RE-CALCULATE: ACTIVE OBJECTIVES ONLY, AND THE DCCR RATE MADE CHEAP
--       (2026-10-06).
--
-- The user: "Could not re-calculate: canceling statement due to statement
-- timeout -- Re-calculate only Active Objectives."
--
--   1. recalc_quality_objectives(year, keep) is RESTATED FROM THE DATABASE
--      (0349's body) with one condition added: only objectives whose status
--      is Active. A Not Working or Do Not Use objective keeps its figures.
--   2. The DCCR failure rate (0393) built every commissioning month back to the
--      oldest machine (1982 -- over 500 months) and, for each, re-counted the
--      machines and the calls with a sub-query; and it looked each call's
--      machine up by upper(serial), which no index serves. Same rules, same
--      answers: the machines and the calls are now each counted ONCE, grouped by
--      month, and the machine is found by lower(btrim(serial)) -- the
--      expression products_serial_key_idx already indexes.
-- ===========================================================================

create or replace function public._dccr_failure_calls(p_product text, p_serial text, p_asof date)
returns table (ucn text, call_number text, reg_date date, product_name text, serial text,
               party_name text, installed_on date, commissioning_month date,
               days_to_failure integer, spare_category text, any_potential_effect text)
language sql stable security definer set search_path = public as $$
  select c.ucn, c.call_number, c.reg_date, c.product_name, c.serial, c.party_name,
         m.warranty_start, date_trunc('month', m.warranty_start)::date,
         (c.reg_date - m.warranty_start)::integer,
         coalesce(r.spare_category, ''), coalesce(r.any_potential_effect, '')
    from public.field_calls c
    join public.call_reviews r on r.ucn = c.ucn
    join lateral (
      select pr.warranty_start
        from public.products pr
       where lower(btrim(pr.serial_number)) = lower(btrim(c.serial))
         and pr.item_name ilike p_product
         and pr.warranty_start is not null
         and pr.warranty_start <= c.reg_date
       order by pr.warranty_start desc, pr.id desc
       limit 1) m on true
   where c.cancelled_at is null
     and btrim(coalesce(c.serial, '')) <> ''
     and c.product_name ilike p_product
     and coalesce(c.serial, '') ilike p_serial
     and c.reg_date <= p_asof
     and (upper(coalesce(r.spare_category, '')) like '%SPARE%'
          or upper(btrim(coalesce(r.any_potential_effect, ''))) = 'YES')
$$;
revoke execute on function public._dccr_failure_calls(text, text, date) from public, anon, authenticated;

create or replace function public._dccr_failure_cohort_rows(p_product text, p_serial text, p_asof date, p_window integer)
returns table (month date, parc integer, failures integer, rate numeric)
language sql stable security definer set search_path = public as $$
  with mach as (
    select date_trunc('month', pr.warranty_start)::date as cm, count(*)::integer as n
      from public.products pr
     where pr.item_name ilike p_product
       and coalesce(pr.serial_number, '') ilike p_serial
       and btrim(coalesce(pr.serial_number, '')) <> ''
       and pr.warranty_start is not null
       and pr.warranty_start <= p_asof
     group by 1
  ),
  fails as (
    select k.commissioning_month as cm, count(*)::integer as n
      from public._dccr_failure_calls(p_product, p_serial, p_asof) k
     where k.reg_date <= (k.installed_on + make_interval(months => p_window))::date
     group by 1
  ),
  months as (
    select generate_series((select min(cm) from mach), date_trunc('month', p_asof)::date,
                           interval '1 month')::date as m
  )
  select ms.m,
         coalesce(mc.n, 0),
         case when (ms.m + make_interval(months => p_window))::date <= p_asof then coalesce(f.n, 0) end,
         case when (ms.m + make_interval(months => p_window))::date <= p_asof and coalesce(mc.n, 0) > 0
              then round(coalesce(f.n, 0)::numeric / mc.n, 6) end
    from months ms
    left join mach mc on mc.cm = ms.m
    left join fails f on f.cm = ms.m
$$;
revoke execute on function public._dccr_failure_cohort_rows(text, text, date, integer) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recalc_quality_objectives(p_year integer, p_keep_overrides boolean)
 RETURNS TABLE(objective text, months_written integer, months_kept integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            where year = p_year and calc_key <> ''
              -- ACTIVE ONLY (0396, the user 2026-10-06: "Re-calculate only Active
              -- Objectives"): Not Working / Do Not Use are left as they are.
              and coalesce(status, 'Active') = 'Active'
            order by sort_order loop
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
end $function$;
