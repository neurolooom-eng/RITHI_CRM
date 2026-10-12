-- ===========================================================================
-- 0420 -- KY550200 OFF INDOOR SERVICE: SPARE REQUEST OR44271's LINE DROPPED,
-- SO18001's ROW AND ITS TRANSFER LINE DELETED (the user, 2026-10-12, on
-- INDOOR SERVICE's KY550200 line in Hand Stock: "Same for this one also";
-- asked how, since a spare request is a quality record the database refuses
-- to delete, they chose "Drop the request line").
--
-- Measured on the live project first (_ky550200_indoor.sql):
--   * spare_request_lines 3005 -- OR44271 (uid v2_N1-77d59cbd), INDOOR
--     SERVICE, Call Based, UCN 26B25F0002, KY550200 MOTHER BOARD - OSIRIS 3,
--     qty 1, dispatched_qty 1, Dispatched 16-Mar-2026; the request's only
--     line. Its stock out is the ledger's "Stores DC OR44271".
--   * spare_issue_history 42748 -- SO18001 | SO18001|OR44271|KY550200: the
--     same issue in the old Stock Out file, counted only while the request
--     line is dispatched (the ledger does not count one issue twice).
--   * stock_transfer_lines 866 -- ST-2609-0005, INDOOR SERVICE -> AJAY G
--     (INDOOR SERVICE), KY550200 qty 1. AJAY G's consumption of it on
--     26G06F0006 is VOIDED (qty 0) and is left as it is.
-- After: INDOOR SERVICE KY550200 0 (was 0), AJAY G 0 (was 1).
--
-- THE REQUEST IS KEPT: its line is DROPPED -- stores_status Dropped, the
-- reason in dispatch_remarks, as Pending Dispatch's Drop writes it -- and its
-- dispatched quantity set to 0, so it is no longer a stock out and never
-- re-enters the dispatch queue. The row audit photographs that update. The
-- two deleted rows' images are written to record_audit first. Every write
-- matches its row's id AND content, so a re-run changes nothing.
-- ===========================================================================
do $once$
begin
  update public.spare_request_lines l
     set stores_status = 'Dropped', dispatched_qty = 0,
         dispatch_remarks = 'Removed at the user''s request (0420, 2026-10-12): not held by INDOOR SERVICE',
         dispatched_by = '0420 (data fix)', dispatched_at = now()
    from public.spare_requests r
   where l.id = 3005 and r.uid = l.request_uid and r.or_no = 'OR44271'
     and public.part_code(l.part) = 'KY550200' and coalesce(l.stores_status, '') <> 'Dropped';

  if to_regclass('public.record_audit') is not null then
    insert into public.record_audit (table_name, op, record_key, old_data, new_data)
    select 'spare_issue_history', 'DELETE', h.id::text, to_jsonb(h),
           jsonb_build_object('note', '0420: deleted at the user''s request with OR44271''s KY550200 line dropped')
      from public.spare_issue_history h
     where h.id = 42748 and h.so_no = 'SO18001' and public.part_code(h.part) = 'KY550200' and h.engineer = 'INDOOR SERVICE';
    insert into public.record_audit (table_name, op, record_key, old_data, new_data)
    select 'stock_transfer_lines', 'DELETE', l.id::text, to_jsonb(l),
           jsonb_build_object('note', '0420: deleted at the user''s request with OR44271''s KY550200 line dropped')
      from public.stock_transfer_lines l
     where l.id = 866 and l.transfer_uid = 'ST-2609-0005' and public.part_code(l.part) = 'KY550200' and l.qty = 1;
  end if;

  delete from public.stock_transfer_lines l
   where l.id = 866 and l.transfer_uid = 'ST-2609-0005' and public.part_code(l.part) = 'KY550200' and l.qty = 1;
  delete from public.spare_issue_history h
   where h.id = 42748 and h.so_no = 'SO18001' and public.part_code(h.part) = 'KY550200' and h.engineer = 'INDOOR SERVICE';
end $once$;
