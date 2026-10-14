-- Read-only probe: who changed calls and visits today, and where the
-- "Canceled" visit statuses went.
select 1 as n, 'calls ' || op || ' by ' || coalesce(actor_email, '(no user)') || ' ' || to_char(min(changed_at) at time zone 'Asia/Kolkata', 'HH24:MI') || '-' || to_char(max(changed_at) at time zone 'Asia/Kolkata', 'HH24:MI') as k, count(*)::text as v
  from public.record_audit where table_name in ('field_calls', 'installation_calls', 'pm_calls')
   and changed_at >= timestamptz '2026-10-13 00:00+05:30' group by op, actor_email
union all
select 2, 'calls: field changed today -> ' || f.key, count(*)::text
  from public.record_audit a, jsonb_each(a.new_data) f
 where a.table_name in ('field_calls', 'installation_calls', 'pm_calls') and a.op = 'UPDATE'
   and a.changed_at >= timestamptz '2026-10-14 00:00+05:30'
   and f.key not like 'sys_%' and (a.old_data -> f.key) is distinct from f.value
 group by f.key
union all
select 3, 'calls: open_state ' || coalesce(a.old_data->>'open_state', '?') || ' -> ' || coalesce(a.new_data->>'open_state', '?'), count(*)::text
  from public.record_audit a
 where a.table_name in ('field_calls', 'installation_calls', 'pm_calls') and a.op = 'UPDATE'
   and (a.old_data->>'open_state') is distinct from (a.new_data->>'open_state')
   and a.changed_at >= timestamptz '2026-09-20 00:00+05:30'
 group by 2
union all
select 4, 'reports audit ' || op || ' ' || to_char(changed_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') || ' by ' || coalesce(actor_email, '(no user)'), count(*)::text
  from public.record_audit where table_name = 'reports' and changed_at >= timestamptz '2026-10-01 00:00+05:30'
 group by op, to_char(changed_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), actor_email
union all
select 5, 'reports: call_status was Cancel% in an audited change', count(*)::text
  from public.record_audit where table_name = 'reports' and old_data->>'call_status' ilike '%cancel%'
union all
select 6, 'calls with last_status Cancel%', count(*)::text from public.calls where last_status ilike '%cancel%'
union all
select 7, 'call_requests status values: ' || coalesce(status, '(blank)'), count(*)::text from public.call_requests group by status
order by 1, 2;
