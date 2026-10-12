-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12): KY550200 on INDOOR SERVICE -- the user wants
-- it deleted "same" as KY732930: the stock out (Stores DC OR44271, UCN
-- 26B25F0002) and its transfer line on ST-2609-0005. What carries it.
-- ===========================================================================
select n, item, value from (
  select 10 + row_number() over (order by l.id)::int as n, 'request line ' || l.id as item,
         'OR ' || coalesce(r.or_no, '') || ' | uid ' || r.uid || ' | ' || coalesce(r.engineer, '') || ' | ' || coalesce(r.req_type, '')
         || ' | UCN ' || coalesce(r.ucn, '') || ' | ' || coalesce(l.part, '') || ' | qty ' || coalesce(l.qty::text, '')
         || ' | dispatched_qty ' || coalesce(l.dispatched_qty::text, '-') || ' | stores ' || coalesce(l.stores_status, '')
         || ' | dc ' || coalesce(l.dc_number, '') || ' | dispatched_at ' || coalesce(l.dispatched_at::text, '-')
         || ' | received ' || coalesce(l.received_at::text, '-') || ' | line_uid ' || coalesce(l.line_uid, '')
         || ' | stage ' || coalesce(r.stage, '') || ' | lines on request ' || (select count(*) from public.spare_request_lines x where x.request_uid = r.uid) as value
    from public.spare_request_lines l join public.spare_requests r on r.uid = l.request_uid
   where public.part_code(l.part) = 'KY550200' and r.engineer ilike '%INDOOR%'
  union all
  select 30 + row_number() over (order by dl.id)::int, 'dispatch line ' || dl.id,
         'dispatch ' || dl.dispatch_uid || ' | dc ' || coalesce(d.dc_number, '') || ' | ' || coalesce(dl.part, '') || ' | qty ' || dl.qty
         || ' | at ' || coalesce(d.dispatched_at::text, '') || ' | lines on that dispatch ' || (select count(*) from public.spare_dispatch_lines y where y.dispatch_uid = dl.dispatch_uid)
    from public.spare_dispatch_lines dl join public.spare_dispatches d on d.uid = dl.dispatch_uid
    join public.spare_request_lines l on l.id = dl.line_id join public.spare_requests r on r.uid = l.request_uid
   where public.part_code(dl.part) = 'KY550200' and r.engineer ilike '%INDOOR%'
  union all
  select 50 + row_number() over (order by h.id)::int, 'issue history ' || h.id,
         coalesce(h.so_no, '') || ' | ' || coalesce(h.ref, '') || ' | ' || coalesce(h.engineer, '') || ' | ' || h.qty || ' | ' || coalesce(h.issued_at::text, '')
    from public.spare_issue_history h
   where h.part_code = 'KY550200' and h.engineer ilike '%INDOOR%'
  union all
  select 60 + row_number() over (order by m.moved_at)::int, 'movement ' || m.engineer,
         m.moved_at::text || ' | ' || m.movement || ' | ' || m.qty || ' | ' || m.ref_type || ' ' || m.ref || ' | UCN ' || m.ucn
    from public.handstock_movements m
   where m.part_code = 'KY550200' and (m.engineer ilike '%INDOOR%' or m.engineer ilike '%AJAY G%')
  union all
  select 80 + row_number() over (order by l.id)::int, 'transfer line ' || l.id,
         l.transfer_uid || ' | ' || coalesce(l.part, '') || ' | qty ' || l.qty
    from public.stock_transfer_lines l where l.transfer_uid = 'ST-2609-0005' and public.part_code(l.part) = 'KY550200'
  union all
  select 90, 'AJAY G consumption of KY550200',
         count(*)::text || ' line(s): ' || coalesce(string_agg(ucn || ' ' || created_at::date, ', '), '')
    from public.spare_consumption where public.part_code(part) = 'KY550200' and engineer ilike '%AJAY G%'
  union all
  select 91, 'consumption of KY550200 on UCN 26B25F0002',
         count(*)::text || ' line(s): ' || coalesce(string_agg(engineer || ' ' || qty || ' ' || created_at::date, ', '), '')
    from public.spare_consumption where public.part_code(part) = 'KY550200' and ucn = '26B25F0002'
  union all
  select 100, 'delete guards on spare_request_lines / spare_dispatch_lines / spare_dispatches',
         coalesce((select string_agg(c.relname || ':' || g.tgname, ', ' order by c.relname, g.tgname)
                     from pg_trigger g join pg_class c on c.oid = g.tgrelid
                    where c.relname in ('spare_request_lines', 'spare_dispatch_lines', 'spare_dispatches', 'spare_requests')
                      and not g.tgisinternal and (g.tgtype & 8) = 8), '(none)')
) x order by n;
