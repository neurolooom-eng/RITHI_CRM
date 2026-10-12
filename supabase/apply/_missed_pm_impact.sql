-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12): the Missed PM rule, measured before it is
-- built. The user: "There is a Column in PM Calls - Added On Date ... Any Call
-- Generated for March after March is a Missed PM" -- a call whose added_on
-- falls after the end of its registration month. For every 2026 objective on
-- open_rate_monthly, per measured month: the calls, how many are missed,
-- the stored figure, and the figure with the missed calls left out.
-- ===========================================================================
with o as (
  select * from public.quality_objectives where year = 2026 and calc_key = 'open_rate_monthly'
),
m as (select generate_series(1, 9) as mm),
calls as (
  select 'pm' as fam, ucn, call_type, reg_date, added_on, cancelled_at from public.pm_calls
  union all select 'field', ucn, call_type, reg_date, added_on, cancelled_at from public.field_calls
  union all select 'install', ucn, call_type, reg_date, added_on, cancelled_at from public.installation_calls
),
rows_ as (
  select o.id, o.parameter, o.calc_params, mm, p.period_start, p.period_end, p.solve_cutoff,
         to_jsonb(o) ->> ('m' || lpad(mm::text, 2, '0')) as stored
    from o cross join m
    join lateral public.objective_period(o.id, mm) p on p.applies
),
counted as (
  select r.id, r.parameter, r.calc_params, r.mm, r.stored,
         count(c.*) as n,
         count(*) filter (where c.added_on > (date_trunc('month', c.reg_date) + interval '1 month - 1 day')::date) as missed,
         count(*) filter (where not exists (select 1 from public.reports x where x.ucn = c.ucn and x.call_status ilike 'solved%'
                                              and coalesce(x.visit_at::date, x.updated_at::date) <= r.solve_cutoff)) as open_n,
         count(*) filter (where c.added_on > (date_trunc('month', c.reg_date) + interval '1 month - 1 day')::date
                            and not exists (select 1 from public.reports x where x.ucn = c.ucn and x.call_status ilike 'solved%'
                                              and coalesce(x.visit_at::date, x.updated_at::date) <= r.solve_cutoff)) as open_missed,
         count(*) filter (where c.added_on is null) as no_added_on
    from rows_ r
    join calls c
      on c.fam = case lower(btrim(coalesce(r.calc_params ->> 'family', ''))) when 'installation' then 'install' else lower(btrim(coalesce(r.calc_params ->> 'family', ''))) end
     and c.cancelled_at is null
     and c.call_type ilike coalesce(nullif(btrim(r.calc_params ->> 'call_type'), ''), '%')
     and c.reg_date between r.period_start and r.period_end
   group by 1, 2, 3, 4, 5
)
select n, item, value from (
  select (o.id * 100)::int as n, 'OBJECTIVE ' || o.id || ' · ' || o.parameter as item,
         'params=' || coalesce(o.calc_params::text, '{}') || ' freq=' || coalesce(o.frequency, '') as value
    from o
  union all
  select (id * 100 + mm)::int, '  month ' || mm,
         'calls=' || n || ' missed=' || missed || ' (no added_on: ' || no_added_on || ')'
         || ' open=' || open_n || ' open_missed=' || open_missed
         || ' stored=' || coalesce(stored, '-')
         || ' rate_now=' || case when n > 0 then round(open_n::numeric / n, 4)::text else '-' end
         || ' rate_without_missed=' || case when n - missed > 0 then round((open_n - open_missed)::numeric / (n - missed), 4)::text else '-' end
    from counted
) x
order by n;
