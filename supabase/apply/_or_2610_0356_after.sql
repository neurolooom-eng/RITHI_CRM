-- Read-only: is OR-2610-0356 gone? One grid.
select * from (
  select 1 as row, 'spare_requests OR-2610-0356' as what, (select count(*) from public.spare_requests where or_no = 'OR-2610-0356')::text as value
  union all select 2, 'spare_request_lines OR-2610-0356-01', (select count(*) from public.spare_request_lines where line_uid = 'OR-2610-0356-01')::text
  union all select 3, 'spare_dispatches SO-2610-0135', (select count(*) from public.spare_dispatches where uid = 'SO-2610-0135')::text
  union all select 4, 'spare_dispatch_lines on SO-2610-0135', (select count(*) from public.spare_dispatch_lines where dispatch_uid = 'SO-2610-0135')::text
  union all select 5, 'Rithi Admin NO-001 available', public.engineer_stock_available('Rithi Admin', 'NO-001|NONE')::text
  union all select 6, 'record_audit DELETE images', (select count(*) from public.record_audit where op = 'DELETE' and (record_key = 'SO-2610-0135' or old_data->>'or_no' = 'OR-2610-0356' or old_data->>'line_uid' = 'OR-2610-0356-01'))::text
) z order by row;
