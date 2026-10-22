-- ===========================================================================
-- CALL HISTORY ROWS GET THE SERIAL THEIR FILE CARRIED UNDER "PRODUCT SERIAL
-- NUMBER" (0452), so Machine History -- which finds a history call by serial --
-- lists them and their Service Report can be opened.
-- Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

alter table public.call_history disable trigger user;
insert into public.call_history (ucn, call_no, item_name, serial, extra, loaded_at) values
  ('CHS-1', 'WI-VEGA-219', 'VEGA', '',     '{"Product Serial Number":"219","Service Report":"42X_Files_/a.pdf"}', '2026-10-01 10:00+05:30'),
  ('CHS-2', 'WI-VEGA-220', 'VEGA', '220',  '{"Product Serial Number":"999"}', '2026-10-01 10:00+05:30'),
  ('CHS-3', 'WI-VEGA-221', 'VEGA', '',     '{}', '2026-10-01 10:00+05:30');
alter table public.call_history enable trigger user;

\i supabase/migrations/0452_call_history_serial_from_file.sql

select (select serial from public.call_history where ucn = 'CHS-1') = '219'
   and (select extra->>'Product Serial Number' from public.call_history where ucn = 'CHS-1') = '219'
       as "an empty serial takes the file's Product Serial Number, which stays kept";
select (select serial from public.call_history where ucn = 'CHS-2') = '220' as "a serial already there is not overwritten";
select coalesce((select serial from public.call_history where ucn = 'CHS-3'), '') = '' as "a row with none stays without";
select (select loaded_at from public.call_history where ucn = 'CHS-1') = '2026-10-01 10:00+05:30'::timestamptz
       as "the load time is not rewritten";
\i supabase/migrations/0452_call_history_serial_from_file.sql
select (select count(*) from public.record_audit where table_name = 'call_history' and op = 'BULK UPDATE' and new_data->>'note' like '0452:%') = 1
       as "one audit record, and a re-run changes nothing";
