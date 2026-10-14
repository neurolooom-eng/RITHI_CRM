-- Read-only probe: which calls were cancelled before and may now read Unsolved?
with lv as (
  select distinct on (ucn) ucn, call_status from public.reports order by ucn, updated_at desc nulls last, id desc
), anycancel as (
  select distinct ucn from public.reports where call_status ilike '%cancel%'
)
select 1 as n, 'cancelled in RITHI (cancelled_at set)' as k, count(*)::text as v from public.calls where cancelled_at is not null
union all select 2, '...of them NOT reading Cancelled', count(*)::text from public.calls where cancelled_at is not null and open_state <> 'Cancelled'
union all select 3, 'reading Cancelled from a visit (no cancelled_at)', count(*)::text from public.calls where cancelled_at is null and open_state = 'Cancelled'
union all select 4, 'a visit said Cancel but call now reads: ' || c.open_state || ' / latest visit: ' || coalesce(lv.call_status, '-'), count(*)::text
  from public.calls c join anycancel a on a.ucn = c.ucn left join lv on lv.ucn = c.ucn
 where c.open_state <> 'Cancelled' group by c.open_state, lv.call_status
union all select 5, 'request Cancelled but call reads: ' || c.open_state, count(*)::text
  from public.calls c join public.call_requests r on r.ucn = c.ucn
 where (r.status ilike 'cancel%' or r.cancelled_at is not null) group by c.open_state
union all select 6, 'audit 2026-10-14 ' || table_name || ' ' || op, count(*)::text
  from public.record_audit where table_name in ('field_calls', 'installation_calls', 'pm_calls')
   and changed_at >= timestamptz '2026-10-14 00:00+05:30' group by table_name, op
union all select 7, 'audit: open_state Cancelled -> ' || coalesce(new_data->>'open_state', '?') || ' on ' || table_name, count(*)::text
  from public.record_audit where table_name in ('field_calls', 'installation_calls', 'pm_calls')
   and old_data->>'open_state' = 'Cancelled' and coalesce(new_data->>'open_state', '') <> 'Cancelled'
 group by new_data->>'open_state', table_name
union all select 8, 'FFR says cancelled, call reads: ' || c.open_state, count(*)::text
  from public.field_failure_reports f join public.calls c on c.ucn = f.ucn
 where f.current_call_status ilike '%cancel%' and c.open_state <> 'Cancelled' group by c.open_state
order by 1, 2;
