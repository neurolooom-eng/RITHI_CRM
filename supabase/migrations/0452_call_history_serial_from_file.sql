-- ===========================================================================
-- 0452 -- CALL HISTORY ROWS GET THE SERIAL THEIR FILE CARRIED UNDER "PRODUCT
-- SERIAL NUMBER" (the user, 2026-10-22: "In call history.. There won't be
-- separate visit entry.. the report link will be present in Service Report
-- column"; their Service Reports could not be opened because the calls were
-- never listed).
--
-- Measured on the live project the same day (_history_report_reach.sql):
-- 9,192 history calls; 2,568 carry a Service Report, and 2,561 of those have
-- an EMPTY serial column -- their file wrote the serial under "Product Serial
-- Number", a heading the upload did not know, so it was kept among the row's
-- other columns. Machine History finds history calls BY SERIAL, so it never
-- listed them and their reports never showed. 3,127 history calls are in that
-- state in all.
--
-- The serial is copied, as the file wrote it, into the serial column of every
-- row whose serial is empty and whose kept columns carry one; the kept value
-- stays where it is. The upload recognises the heading from now on. Done with
-- this table's triggers paused -- call_history_stamp would otherwise rewrite
-- every row's load time to today -- and one record_audit row says what was done.
-- ===========================================================================
do $$
declare n bigint;
begin
  alter table public.call_history disable trigger user;
  update public.call_history
     set serial = btrim(extra->>'Product Serial Number')
   where coalesce(btrim(serial), '') = ''
     and coalesce(btrim(extra->>'Product Serial Number'), '') <> '';
  get diagnostics n = row_count;
  alter table public.call_history enable trigger user;
  if n > 0 and to_regclass('public.record_audit') is not null then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    values ('call_history', 'BULK UPDATE', null, null, null, jsonb_build_object('serial', ''),
            jsonb_build_object('rows', n, 'note', '0452: serial copied from the file''s own "Product Serial Number" (kept in extra, unchanged), so Machine History can find these calls.'));
  end if;
  raise notice '0452: % Call History row(s) given the serial their file carried', n;
end $$;
