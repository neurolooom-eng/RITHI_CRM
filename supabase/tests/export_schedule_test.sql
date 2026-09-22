-- ===========================================================================
-- SCHEDULED EXPORT (0228) — when it is owed, and what may be asked for.
--
-- The Edge Function that sends the mail cannot be run by any suite here. So
-- every decision that could be taken out of it was: WHEN a schedule is due is
-- `export_run_due_at()`, and WHAT a schedule may name is a trigger. Both are
-- below, with the two that carry weight stated as refusals:
--
--   * an audit trail can never be scheduled, however it is spelled;
--   * the run history cannot be edited or erased through the API, by anyone.
--
-- THERE IS NO DESTINATION TO TEST, and that is the design: who receives the
-- mail is a secret on the function, not a column here, so no test can exist
-- for "an administrator changed where the database goes" — there is no path.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('e0e0e0e0-0000-0000-0000-000000000001','xp_admin@x.com'),
 ('e0e0e0e0-0000-0000-0000-000000000002','xp_engineer@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('e0e0e0e0-0000-0000-0000-000000000001','xp_admin@x.com','An Administrator','admin'),
 ('e0e0e0e0-0000-0000-0000-000000000002','xp_engineer@x.com','An Engineer','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
delete from public.export_runs;
delete from public.export_schedules;

\echo '--- 1. a daily schedule: the most recent 23:00 IST, either side of it ---'
\echo 'expect: 21-Sep 23:00 before the hour, 22-Sep 23:00 after it, and 22-Sep at it'
select
  public.export_run_due_at('daily', null, 23::smallint, 0::smallint,
    timestamptz '2026-09-22 22:00+05:30') at time zone 'Asia/Kolkata' as before_the_hour,
  public.export_run_due_at('daily', null, 23::smallint, 0::smallint,
    timestamptz '2026-09-22 23:30+05:30') at time zone 'Asia/Kolkata' as after_it,
  public.export_run_due_at('daily', null, 23::smallint, 0::smallint,
    timestamptz '2026-09-22 23:00+05:30') at time zone 'Asia/Kolkata' as exactly_at_it;

\echo '--- 2. THE CALLER IS IN UTC AND THE SCHEDULE IS NOT ---'
\echo 'expect: 22-Sep 23:00 -- 18:00 UTC is 23:30 IST, so tonight''s has passed.'
\echo 'A job that read the clock where it runs would answer 21-Sep and look right.'
select public.export_run_due_at('daily', null, 23::smallint, 0::smallint,
  timestamptz '2026-09-22 18:00+00:00') at time zone 'Asia/Kolkata' as due;

\echo '--- 3. a weekly schedule wraps to the previous week ---'
\echo 'expect: 2026-09-22 is a TUESDAY (dow 2).'
\echo '  a Tuesday schedule, asked before its hour  -> 15-Sep (a week back)'
\echo '  the same, asked after its hour             -> 22-Sep (today)'
\echo '  a SUNDAY schedule, asked on the Tuesday    -> 20-Sep (two days back)'
select
  public.export_run_due_at('weekly', 2::smallint, 23::smallint, 0::smallint,
    timestamptz '2026-09-22 22:00+05:30') at time zone 'Asia/Kolkata' as tue_before,
  public.export_run_due_at('weekly', 2::smallint, 23::smallint, 0::smallint,
    timestamptz '2026-09-22 23:30+05:30') at time zone 'Asia/Kolkata' as tue_after,
  public.export_run_due_at('weekly', 0::smallint, 23::smallint, 0::smallint,
    timestamptz '2026-09-22 23:30+05:30') at time zone 'Asia/Kolkata' as sun_from_tue;

\echo '--- 4. a weekly schedule with no day is not a schedule ---'
\echo 'expect: null -- refused rather than defaulted to Sunday, because a job'
\echo 'that silently picks a day is one nobody can predict'
select public.export_run_due_at('weekly', null, 23::smallint, 0::smallint, now()) as due;

\echo '--- 5. a schedule is owed until it has run ---'
\echo 'expect: one row -- last_run_at is null, so the most recent due instant is'
\echo 'newer than it'
insert into public.export_schedules (label, tables, frequency, hour_ist, minute_ist)
values ('Nightly registers', array['calls','reports'], 'daily', 0, 1);
select label, tables from public.due_export_schedules();

\echo '--- 6. ...and is not owed again the same period ---'
\echo 'expect: 0 rows'
update public.export_schedules set last_run_at = now();
select count(*) as still_owed from public.due_export_schedules();

\echo '--- 7. A MISSED NIGHT IS CAUGHT UP, NOT LOST ---'
\echo 'expect: 1 -- the container was down at the scheduled minute; the next'
\echo 'tick still owes it, which is why the job asks "is it newer than the last'
\echo 'run" rather than "is it that minute now"'
update public.export_schedules set last_run_at = now() - interval '3 days';
select count(*) as owed_after_a_gap from public.due_export_schedules();

\echo '--- 8. a disabled schedule is never owed ---'
\echo 'expect: 0'
update public.export_schedules set enabled = false;
select count(*) as owed_while_off from public.due_export_schedules();
update public.export_schedules set enabled = true, last_run_at = now();

\echo '--- 9. AN AUDIT TRAIL CANNOT BE SCHEDULED ---'
\echo 'expect ERROR: This system does not export "record_audit"'
insert into public.export_schedules (label, tables) values ('Sneaky', array['calls','record_audit']);

\echo '--- 10. ...nor can a table that does not exist ---'
\echo 'expect ERROR: This system does not export "no_such_table"'
insert into public.export_schedules (label, tables) values ('Typo', array['no_such_table']);

\echo '--- 11. ...nor nothing at all ---'
\echo 'expect ERROR twice: at least one table; and a name'
insert into public.export_schedules (label, tables) values ('Empty', array[]::text[]);
insert into public.export_schedules (label, tables) values ('   ', array['calls']);

\echo '--- 12. the names are sorted and de-duplicated ---'
\echo 'expect: {calls,parties,reports} -- so the attachment order is stable and'
\echo 'a table named twice is not read twice'
insert into public.export_schedules (label, tables)
values ('Messy', array['reports','calls','reports','parties']);
select tables from public.export_schedules where label = 'Messy';

\echo '--- 13. an hour outside the day is refused ---'
\echo 'expect ERROR: export_schedules_when_check'
insert into public.export_schedules (label, tables, hour_ist) values ('Hour 24', array['calls'], 24);

\echo '--- 14. created_by is STAMPED, and what the caller sends is discarded ---'
\echo 'expect: xp_admin@x.com -- not the engineer the insert names'
call public.be('xp_admin@x.com');
begin;
  set local role authenticated;
  insert into public.export_schedules (label, tables, created_by)
  values ('Stamped', array['calls'], 'e0e0e0e0-0000-0000-0000-000000000002');
commit;
select (select email from auth.users u where u.id = s.created_by) as created_by
  from public.export_schedules s where s.label = 'Stamped';

\echo '--- 15. an engineer sees no schedules and can add none ---'
\echo 'expect: 0'
call public.be('xp_engineer@x.com');
begin;
  set local role authenticated;
  select count(*) as visible_to_engineer from public.export_schedules;
commit;
\echo 'expect ERROR: new row violates row-level security policy for table "export_schedules"'
begin;
  set local role authenticated;
  insert into public.export_schedules (label, tables) values ('Mine', array['calls']);
commit;

\echo '--- 16. an administrator sees them ---'
\echo 'expect: 3 -- Nightly registers, Messy and Stamped'
call public.be('xp_admin@x.com');
begin;
  set local role authenticated;
  select count(*) as visible_to_admin from public.export_schedules;
commit;

\echo '--- 17. THE RUN HISTORY IS READ-ONLY THROUGH THE API ---'
\echo 'expect ERROR three times: permission denied for table export_runs'
insert into public.export_runs (label, status) values ('a run that happened', 'sent');
begin;
  set local role authenticated;
  insert into public.export_runs (label, status) values ('not through here', 'sent');
commit;
begin;
  set local role authenticated;
  update public.export_runs set status = 'something else';
commit;
begin;
  set local role authenticated;
  delete from public.export_runs;
commit;
\echo 'expect: 1 -- still there, unchanged'
select count(*) as runs, max(status) as status from public.export_runs;

\echo '--- 18. ...and an administrator may read it ---'
\echo 'expect: 1'
begin;
  set local role authenticated;
  select count(*) as visible_to_admin from public.export_runs;
commit;

\echo '--- 19. an engineer may not ---'
\echo 'expect: 0 -- what left the building is an administrator''s business'
call public.be('xp_engineer@x.com');
begin;
  set local role authenticated;
  select count(*) as visible_to_engineer from public.export_runs;
commit;

\echo '--- 20. the picker and the guard ask the SAME question ---'
\echo 'expect: t, t, f, f -- one rule, so a table the screen will not offer is'
\echo 'one the schedule will refuse'
call public.be(null);
select public.is_exportable_table('calls')        as calls_ok,
       public.is_exportable_table('reports')      as reports_ok,
       public.is_exportable_table('record_audit') as audit_refused,
       public.is_exportable_table('audit_log')    as log_refused;

\echo '--- 21. cleanup ---'
delete from public.export_runs;
delete from public.export_schedules;
delete from public.profiles where email like 'xp_%@x.com';
