-- ===========================================================================
-- ARE THE OLD CALLS MARKED AS HISTORICAL? (2026-10-06) -- READ-ONLY.
-- One row per call register and year before 2026: how many calls, how many
-- carry the historical-import mark (extra.imported_from) that keeps them off
-- the registers, how many came through the historical DCCR load
-- (dccr_history_import), and when they were created.
-- ===========================================================================
select t.reg, lpad((extract(year from t.reg_date)::int % 100)::text, 2, '0') as yr,
       count(*) as calls,
       count(*) filter (where coalesce(t.extra->>'imported_from', '') <> '') as marked,
       count(*) filter (where exists (select 1 from public.dccr_history_import h where h.ucn = t.ucn)) as via_history_upload,
       min(t.sys_created_on)::date as first_created, max(t.sys_created_on)::date as last_created
  from (select 'field' as reg, ucn, reg_date, extra, sys_created_on from public.field_calls
        union all select 'pm', ucn, reg_date, extra, sys_created_on from public.pm_calls
        union all select 'install', ucn, reg_date, extra, sys_created_on from public.installation_calls) t
 where t.reg_date < date '2026-01-01'
 group by 1, 2
 order by 1, 2;
