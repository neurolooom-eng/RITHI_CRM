-- Read-only: what OR-2610-0356-01 is, before anything is done to it. One grid.
with l as (select * from public.spare_request_lines where line_uid = 'OR-2610-0356-01'),
     r as (select * from public.spare_requests where uid in (select request_uid from l) or or_no = 'OR-2610-0356')
select * from (
  select 1 as row, 'line' as what, coalesce((select jsonb_agg(to_jsonb(l) - 'sys_id' - 'sys_created_by' - 'sys_updated_by')::text from l), 'NONE') as value
  union all select 2, 'request', coalesce((select jsonb_agg(to_jsonb(r) - 'sys_id' - 'sys_created_by' - 'sys_updated_by')::text from r), 'NONE')
  union all select 3, 'lines on the request', (select count(*)::text from public.spare_request_lines x where x.request_uid in (select uid from r))
  union all select 4, 'all line uids on the request', (select string_agg(x.line_uid || ' ' || coalesce(x.part,'') || ' qty ' || coalesce(x.qty::text,'') || ' ' || coalesce(x.stores_status,''), ' || ' order by x.row_no) from public.spare_request_lines x where x.request_uid in (select uid from r))
  union all select 5, 'in the Pending Dispatch queue', coalesce((select jsonb_agg(to_jsonb(v))::text from public.spare_pending_dispatch v where to_jsonb(v)::text ilike '%OR-2610-0356-01%'), 'NO')
  union all select 6, 'dispatch lines', coalesce((select jsonb_agg(to_jsonb(d))::text from public.spare_dispatch_lines d where d.line_id in (select id from l)), 'NONE')
  union all select 7, 'consumption on the request''s UCN + part', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'ucn', c.ucn, 'part', c.part, 'qty', c.qty, 'engineer', c.engineer, 'source', c.source, 'created_at', c.created_at))::text
      from public.spare_consumption c join l on public.part_code(c.part) = public.part_code(l.part) join r on r.uid = l.request_uid where c.ucn = r.ucn), 'NONE')
  union all select 8, 'record_audit rows for the line/request', (select count(*)::text from public.record_audit a where a.record_key in (select id::text from l) or a.record_key in (select uid from r) or a.record_key = 'OR-2610-0356-01')
  union all select 9, 'notifications naming it', (select count(*)::text from public.notifications n where n::text ilike '%OR-2610-0356%')
) z order by row;
