-- ===========================================================================
-- 0419 -- KY732930 OFF STOCK OUT SO16233, AND ITS TRANSFER LINE (the user,
-- 2026-10-12, on INDOOR SERVICE's KY732930 line in Hand Stock: "I want to
-- delete this Item from SO, and the respective movement"; asked which, they
-- chose the SO line AND its transfer line).
--
-- Measured on the live project first (_so16233_ky732930.sql):
--   * spare_issue_history 34166 -- SO16233 | INDOOR SERVICE | KY732930
--     INTERNAL BATTERY PACK Li-Ion | qty 1 | 14-Jul-2025 | ref
--     SO16233|OR39541|KY732930. SO16233's other two lines (KY732693, EM-887)
--     stay.
--   * stock_transfer_lines 867 -- ST-2609-0005 (MTN NO. 317, 25-Sep-2026),
--     INDOOR SERVICE -> AJAY G (INDOOR SERVICE), KY732930 qty 1. The
--     transfer's other six lines stay.
--   * AJAY G holds that unit (1) and has consumed none.
-- After: INDOOR SERVICE KY732930 0 (was 0), AJAY G 0 (was 1).
--
-- Neither table photographs its own deletes, so each row's image is written
-- to record_audit first. Each delete matches the row's id AND its content, so
-- a re-run, or a database where the rows differ, deletes nothing. A migration
-- writes with no signed-in user, which stock_import_allowed() (0339) trusts.
-- ===========================================================================
-- record_audit is created by a later module on a FRESH build, where these rows
-- do not exist either; the image is written wherever the table is present.
do $once$
begin
  if to_regclass('public.record_audit') is not null then
    insert into public.record_audit (table_name, op, record_key, old_data, new_data)
    select 'stock_transfer_lines', 'DELETE', l.id::text, to_jsonb(l),
           jsonb_build_object('note', '0419: deleted at the user''s request with SO16233''s KY732930 line')
      from public.stock_transfer_lines l
     where l.id = 867 and l.transfer_uid = 'ST-2609-0005' and public.part_code(l.part) = 'KY732930' and l.qty = 1;
    insert into public.record_audit (table_name, op, record_key, old_data, new_data)
    select 'spare_issue_history', 'DELETE', h.id::text, to_jsonb(h),
           jsonb_build_object('note', '0419: deleted at the user''s request, with its transfer line ST-2609-0005 / 867')
      from public.spare_issue_history h
     where h.id = 34166 and h.so_no = 'SO16233' and public.part_code(h.part) = 'KY732930' and h.engineer = 'INDOOR SERVICE';
  end if;

  delete from public.stock_transfer_lines l
   where l.id = 867 and l.transfer_uid = 'ST-2609-0005' and public.part_code(l.part) = 'KY732930' and l.qty = 1;
  delete from public.spare_issue_history h
   where h.id = 34166 and h.so_no = 'SO16233' and public.part_code(h.part) = 'KY732930' and h.engineer = 'INDOOR SERVICE';
end $once$;
