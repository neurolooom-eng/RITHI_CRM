-- Read-only: SO-2610-0135 and what else it carries. One grid.
select * from (
  select 1 as row, 'spare_dispatches row' as what, coalesce((select jsonb_agg(to_jsonb(d) - 'sys_id' - 'sys_created_by' - 'sys_updated_by')::text from public.spare_dispatches d where d.uid = 'SO-2610-0135'), 'NONE') as value
  union all select 2, 'dispatch lines on SO-2610-0135', (select count(*)::text || ': ' || coalesce(string_agg(line_uid || ' ' || part || ' x' || qty, ' || '), '') from public.spare_dispatch_lines where dispatch_uid = 'SO-2610-0135')
  union all select 3, 'Rithi Admin NO-001 available', (select public.engineer_stock_available('Rithi Admin', 'NO-001|NONE')::text)
  union all select 4, 'consumption of NO-001 by Rithi Admin', (select count(*)::text from public.spare_consumption c where c.engineer = 'Rithi Admin' and public.part_code(c.part) = 'NO-001')
  union all select 5, 'transfers / returns of NO-001 by Rithi Admin', (select count(*)::text from public.stock_transfer_lines l where to_jsonb(l)::text ilike '%NO-001%')
  union all select 6, 'later OR numbers this month', (select string_agg(or_no, ', ' order by or_no) from public.spare_requests where or_no > 'OR-2610-0356' and or_no like 'OR-2610-%')
  union all select 7, 'later SO numbers this month', (select string_agg(uid, ', ' order by uid) from public.spare_dispatches where uid > 'SO-2610-0135' and uid like 'SO-2610-%')
) z order by row;
