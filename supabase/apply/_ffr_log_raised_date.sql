-- TEMPORARY PROBE: the "Report raised" entry of each FFR's update log against its FFR Date. Read-only, one grid.
with c as (
  select f.id, f.ffr_date, coalesce(btrim(f.imported_from), '') <> '' as imported,
         (h.changed_at at time zone 'Asia/Kolkata')::date as logged_on
    from public.field_failure_reports f
    join public.ffr_history h on h.ffr_id = f.id and h.action = 'create'
)
select 1 as k, 'reports with a Report raised entry' as what, count(*)::text as n from c
union all select 2, 'imported: entry date = FFR Date', count(*) filter (where imported and logged_on = ffr_date)::text from c
union all select 3, 'imported: entry date differs', count(*) filter (where imported and logged_on is distinct from ffr_date)::text from c
union all select 4, 'raised in RITHI: entry date = FFR Date', count(*) filter (where not imported and logged_on = ffr_date)::text from c
union all select 5, 'raised in RITHI: entry date differs', count(*) filter (where not imported and logged_on is distinct from ffr_date)::text from c
union all select 6, 'reports with NO Report raised entry', (select count(*) from public.field_failure_reports f where not exists (select 1 from public.ffr_history h where h.ffr_id = f.id and h.action = 'create'))::text
union all select 7, 'imported differing: most common entry date (dd-mm-yy)', coalesce((select to_char(logged_on, 'DD-MM-YY') || ' x' || count(*) from c where imported and logged_on is distinct from ffr_date group by logged_on order by count(*) desc limit 1), '-')
union all select 8, 'raised in RITHI differing: largest gap in days', coalesce((select max(abs(logged_on - ffr_date))::text from c where not imported and logged_on is distinct from ffr_date), '-')
order by 1;
