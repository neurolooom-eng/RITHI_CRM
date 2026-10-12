-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12): the failure-rate objectives -- what is stored,
-- what a fresh calculation gives, and the counts behind it.
-- The user: "Objective - Recent Failure ... i dont think the calculations are
-- working properly and For these Recent Failures dont need a cutoff date."
-- One grid: rows 1-9 the settings, then per objective (n = id * 100 + month).
-- ===========================================================================
with o as (
  select * from public.quality_objectives
   where calc_key in ('failure_rate_12m', 'dccr_failure_cohort')
      or parameter ilike '%fail%'
),
months as (select generate_series(1, 12) as m)
select n, item, value from (
  select 1 as n, 'failure_window_months' as item, public.objective_setting('failure_window_months', 3)::text as value
  union all select 2, 'failure_rolling_months', public.objective_setting('failure_rolling_months', 12)::text
  union all select 3, 'objective_cutoffs set', coalesce((select string_agg(year || '-' || month || ':' || cutoff_date, ', ' order by year, month) from public.objective_cutoffs), '(none)')
  union all select 4, 'today (IST)', ((now() at time zone 'Asia/Kolkata')::date)::text
  -- one header row per objective
  union all
  select (o.id * 100)::int, 'OBJECTIVE ' || o.id || ' · ' || o.year || ' · ' || coalesce(o.process, '') || ' · ' || coalesce(o.parameter, ''),
         'calc_key=' || coalesce(nullif(o.calc_key, ''), '(typed)') || ' params=' || coalesce(o.calc_params::text, '{}')
         || ' target=' || coalesce(o.yearly_target, '') || ' freq=' || coalesce(o.frequency, '') || ' status=' || coalesce(o.status, '')
         || ' overrides=' || coalesce(o.overrides::text, '{}')
    from o
  -- one row per month: stored vs fresh, and the counts for failure_rate_12m
  union all
  select (o.id * 100 + mm.m)::int,
         '  ' || o.id || ' month ' || mm.m,
         'stored=' || coalesce((to_jsonb(o) ->> ('m' || lpad(mm.m::text, 2, '0'))), '-')
         || ' fresh=' || coalesce(public.objective_value(o.id, mm.m)::text, '-')
         || coalesce(' period=' || (select p.period_start || '..' || p.period_end || ' cutoff=' || coalesce(p.solve_cutoff::text, '-')
                                     from public.objective_period(o.id, mm.m) p where p.applies), ' (not applicable)')
         || case when o.calc_key = 'failure_rate_12m' then coalesce((
              select ' installed=' || count(*) || ' failed=' || count(*) filter (where exists (
                       select 1 from public.field_calls c
                        where upper(btrim(coalesce(c.serial, ''))) = upper(btrim(pr.serial_number))
                          and c.cancelled_at is null and c.product_name ilike (o.calc_params ->> 'product')
                          and c.reg_date >= pr.warranty_start
                          and c.reg_date <= (pr.warranty_start + make_interval(months => public.objective_setting('failure_window_months', 3)))::date
                          and c.reg_date <= p.period_end))
                from public.objective_period(o.id, mm.m) p
                join public.products pr
                  on pr.item_name ilike (o.calc_params ->> 'product')
                 and coalesce(pr.serial_number, '') ilike coalesce(nullif(btrim(o.calc_params ->> 'serial'), ''), '%')
                 and btrim(coalesce(pr.serial_number, '')) <> ''
                 and pr.warranty_start > (p.period_end - make_interval(months => public.objective_setting('failure_rolling_months', 12)))::date
                 and pr.warranty_start <= p.period_end
               where p.applies), '') else '' end
    from o cross join months mm
   where o.calc_key <> ''
) x
order by n;
