-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12): the user wants to delete KY732930 from
-- historical stock out SO16233 (INDOOR SERVICE) "and the respective movement".
-- What is on that SO, what the transfer ST-2609-0005 carries, where the unit
-- went, and what each deletion would leave. One grid.
-- ===========================================================================
select n, item, value from (
  select 10 + row_number() over (order by h.id)::int as n, 'SO16233 line ' || h.id as item,
         coalesce(h.engineer, '') || ' | ' || coalesce(h.part, '') || ' | qty ' || coalesce(h.qty::text, '')
         || ' | issued ' || coalesce(h.issued_at::text, '') || ' | so_no ' || coalesce(h.so_no, '') || ' | ref ' || coalesce(h.ref, '')
         || ' | line_uid ' || coalesce(h.line_uid, '') || ' | source ' || coalesce(h.source, '') as value
    from public.spare_issue_history h
   where btrim(coalesce(h.so_no, '')) ilike '%16233%' or coalesce(h.ref, '') ilike '%16233%'
  union all
  select 40 + row_number() over (order by t.uid, l.id)::int, 'transfer ' || t.uid || ' line ' || l.id,
         coalesce(t.from_engineer, '') || ' -> ' || coalesce(t.to_engineer, '') || ' | ' || coalesce(l.part, '') || ' | qty ' || l.qty
         || ' | dated ' || coalesce(t.transfer_date::text, '') || ' | created ' || t.created_at::text || ' | ' || coalesce(t.remarks, '') || ' | ' || coalesce(l.reason, '')
    from public.stock_transfers t join public.stock_transfer_lines l on l.transfer_uid = t.uid
   where t.uid = 'ST-2609-0005'
  union all
  select 70 + row_number() over (order by b.engineer_key)::int, 'balance ' || b.engineer,
         'KY732930 on_hand ' || b.on_hand || ' (opening ' || b.opening || ', stock out ' || b.stock_out || ', consumed ' || b.consumed
         || ', in ' || b.transferred_in || ', out ' || b.transferred_out || ', returned ' || b.returned || ')'
    from public.handstock_balance b
   where b.part_code = 'KY732930'
     and (b.engineer ilike '%INDOOR%' or b.engineer ilike '%AJAY G%')
  union all
  select 90 + row_number() over (order by m.moved_at)::int, 'AJAY G movement',
         m.moved_at::text || ' | ' || m.movement || ' | ' || m.qty || ' | ' || m.ref || ' | ' || m.ucn
    from public.handstock_movements m
   where m.part_code = 'KY732930' and m.engineer ilike '%AJAY G%'
  union all
  select 120, 'consumption of KY732930 by AJAY G',
         count(*)::text || ' line(s), ' || coalesce(sum(qty), 0) || ' units: ' || coalesce(string_agg(ucn || ' ' || created_at::date, ', '), '')
    from public.spare_consumption
   where public.part_code(part) = 'KY732930' and engineer ilike '%AJAY G%'
  union all
  select 130, 'delete guards on spare_issue_history / stock_transfers / stock_transfer_lines',
         coalesce((select string_agg(c.relname || ':' || g.tgname, ', ' order by c.relname, g.tgname)
                     from pg_trigger g join pg_class c on c.oid = g.tgrelid
                    where c.relname in ('spare_issue_history', 'stock_transfers', 'stock_transfer_lines')
                      and not g.tgisinternal and (g.tgtype & 8) = 8), '(none)')
) x order by n;
