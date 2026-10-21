-- ===========================================================================
-- 0448 -- THE TEST SPARE REQUEST OR-2610-0356 DELETED, WITH ITS STOCK OUT
-- SO-2610-0135 (the user, 2026-10-21: "delete OR-2610-0356-01").
--
-- Measured on the live project first (_or_2610_0356.sql):
--   * spare_requests 13150 -- OR-2610-0356, a
--     HandStock request by Rithi Admin on 21-Oct-2026, reason "test"; its
--     only line:
--   * spare_request_lines 10356 -- OR-2610-0356-01, NO-001|NONE, qty 1, RM
--     and NSM approved by Rithi Admin, dispatched by DEVIKA 21-Oct-2026 on:
--   * spare_dispatches 337 -- SO-2610-0135, to Rithi Admin, that line only;
--   * spare_dispatch_lines 1405 -- the stock out's one line.
--   Nothing received, consumed, transferred or returned against it; no
--   notification names it. Both numbers are the latest of their month.
-- After: Rithi Admin's NO-001 hand stock 0 (was 1).
--
-- A WHOLE DELETE, not the drop 0420 used for a real request: this one is a
-- test, made and dispatched within a minute, and nothing followed from it.
-- A migration runs as the owner, which block_hard_delete (0049) and
-- stock_import_allowed (0339) admit. Three of the four tables photograph
-- their own deletes in record_audit; spare_dispatches does not, so its row's
-- image is written first. Every delete matches the row's id AND its content,
-- so a re-run, or a database where the rows differ, deletes nothing. The
-- number counters are left as they are: the next request is OR-2610-0357.
-- ===========================================================================
do $once$
begin
  if to_regclass('public.record_audit') is not null then
    insert into public.record_audit (table_name, op, record_key, old_data, new_data)
    select 'spare_dispatches', 'DELETE', d.uid, to_jsonb(d),
           jsonb_build_object('note', '0448: deleted at the user''s request with the test request OR-2610-0356')
      from public.spare_dispatches d
     where d.id = 337 and d.uid = 'SO-2610-0135' and d.engineer = 'Rithi Admin' and d.line_count = 1;
  end if;

  delete from public.spare_dispatch_lines x
   where x.id = 1405 and x.dispatch_uid = 'SO-2610-0135' and x.line_uid = 'OR-2610-0356-01'
     and public.part_code(x.part) = 'NO-001' and x.qty = 1;
  delete from public.spare_request_lines l
   where l.id = 10356 and l.line_uid = 'OR-2610-0356-01'
     and public.part_code(l.part) = 'NO-001' and l.qty = 1
     and exists (select 1 from public.spare_requests r where r.uid = l.request_uid and r.id = 13150 and r.or_no = 'OR-2610-0356');
  delete from public.spare_requests r
   where r.id = 13150 and r.or_no = 'OR-2610-0356'
     and r.req_type = 'HandStock' and r.engineer = 'Rithi Admin'
     and not exists (select 1 from public.spare_request_lines l where l.request_uid = r.uid);
  delete from public.spare_dispatches d
   where d.id = 337 and d.uid = 'SO-2610-0135' and d.engineer = 'Rithi Admin'
     and not exists (select 1 from public.spare_dispatch_lines x where x.dispatch_uid = d.uid);
end $once$;
