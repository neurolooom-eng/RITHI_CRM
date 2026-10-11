-- ===========================================================================
-- AN IMPORTED FFR IS LOGGED AS RAISED ON ITS FFR DATE (0410).
--
--   A report loaded from the old register gets its "Report raised" entry on
--   its FFR Date (midnight, India time) with the load time kept as
--   changes._loaded_at; a report raised in RITHI is logged at the moment it
--   was raised, with no _loaded_at; the one-time pass moves an imported
--   report's entry written at the load to its FFR Date, keeping the old time,
--   leaves a RITHI report's alone, and a second pass changes nothing.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.field_failure_reports (ffr_no, ffr_date, ucn, customer_name, problem_reported, imported_from)
values ('FFR - 801/20', '2020-02-27', '20A08001', 'C', 'P', 'Field Failure Register (sheet)'),
       ('FFR - 802/26', current_date - 3, '26A08002', 'C', 'P', '');

select 'an imported report is logged as raised on its FFR Date, India time' as t,
       (select changed_at = '2020-02-27 00:00+05:30' and changes ? '_loaded_at'
          from public.ffr_history where ffr_no = 'FFR - 801/20' and action = 'create') as ok;
select 'a report raised in RITHI is logged when it was raised, with no load time' as t,
       (select changed_at > now() - interval '1 minute' and not changes ? '_loaded_at'
          from public.ffr_history where ffr_no = 'FFR - 802/26' and action = 'create') as ok;

-- An entry written the old way, at the load.
insert into public.field_failure_reports (ffr_no, ffr_date, ucn, customer_name, problem_reported, imported_from)
values ('FFR - 803/21', '2021-05-04', '21A08003', 'C', 'P', 'Field Failure Register (sheet)');
update public.ffr_history set changed_at = '2026-09-14 11:00+05:30', changes = changes - '_loaded_at'
 where ffr_no = 'FFR - 803/21' and action = 'create';
\i supabase/migrations/0410_ffr_log_raised_on_ffr_date.sql
select 'the one-time pass moves it to its FFR Date and keeps the load time' as t,
       (select changed_at = '2021-05-04 00:00+05:30' and (changes ->> '_loaded_at')::timestamptz = '2026-09-14 11:00+05:30'
          from public.ffr_history where ffr_no = 'FFR - 803/21' and action = 'create') as ok;
select '...and leaves a RITHI report''s entry where it was' as t,
       (select changed_at > now() - interval '1 minute'
          from public.ffr_history where ffr_no = 'FFR - 802/26' and action = 'create') as ok;
\i supabase/migrations/0410_ffr_log_raised_on_ffr_date.sql
select 'a second pass changes nothing' as t,
       (select changed_at = '2021-05-04 00:00+05:30' and (changes ->> '_loaded_at')::timestamptz = '2026-09-14 11:00+05:30'
          from public.ffr_history where ffr_no = 'FFR - 803/21' and action = 'create') as ok;
