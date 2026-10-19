-- Read-only: the historical installation calls' years, dates and overlap with live calls. One grid.
with hk as (
  select h.* from public.call_history h where upper(coalesce(h.call_type, '')) like 'INST%'
)
select * from (
  select 1 as row, 'UCN year ' || left(ucn, 2) as what, count(*)::text as value from hk group by left(ucn, 2)
  union all select 20 + row_number() over (order by s, y), 'source / record_year: ' || coalesce(s,'') || ' / ' || coalesce(y::text,''), n::text
    from (select source s, record_year y, count(*) n from hk group by 1, 2) a
  union all select 40 + row_number() over (order by m), 'call_at month ' || m, n::text
    from (select to_char(call_at at time zone 'Asia/Kolkata', 'YYYY-MM') m, count(*) n from hk group by 1) b
  union all select 70, 'also a LIVE installation call (same UCN)', count(*)::text from hk where exists (select 1 from public.installation_calls c where upper(c.ucn) = upper(hk.ucn))
  union all select 71, 'UCN year 26 rows', count(*)::text from hk where left(ucn, 2) = '26'
  union all select 80 + row_number() over (), 'sample: ucn ' || ucn || ' | call_at ' || coalesce(to_char(call_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI'),'') || ' | Timestamp ' || coalesce(extra->>'Timestamp','') || ' | Complaint Date ' || coalesce(extra->>'Complaint Date','') || ' | solved ' || coalesce(solved_at::date::text,''), ''
    from (select * from hk order by ucn limit 3) s1
  union all select 90 + row_number() over (), 'sample: ucn ' || ucn || ' | call_at ' || coalesce(to_char(call_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI'),'') || ' | Timestamp ' || coalesce(extra->>'Timestamp','') || ' | Complaint Date ' || coalesce(extra->>'Complaint Date','') || ' | solved ' || coalesce(solved_at::date::text,''), ''
    from (select * from hk order by ucn desc limit 3) s2
) z order by row, what;
