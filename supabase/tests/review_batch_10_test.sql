-- ===========================================================================
-- REVIEW BATCH 10, PROVED ON A DATABASE (0433, 0434).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-039  a harvested part, an accessory and a check are voided with a
--             reason, never deleted; the void is stamped by the database and
--             final; a voided accessory leaves the list's counts and a new DC;
--             a whole job made in error is still deleted by delete_indoor_job()
--
--   2. D-038  the PM upload asks pm_calls_in_month() which machines already have
--             a PM call this month -- every PM call, past row-level security --
--             and is refused it without pm.bulk_upload (0434); the upload's own
--             checks are proved by check:uploads / check:ui
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb10_work', 'RB10 Workshop', '["mod:/indoor", "indoor.receive", "indoor.work", "indoor.delete"]'::jsonb),
 ('rb10_pmup', 'RB10 PM upload', '["calls.view", "pm.bulk_upload"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id, email) values
  ('0ba00000-0000-0000-0000-000000000001', 'rb10-work@x.com'),
  ('0ba00000-0000-0000-0000-000000000002', 'rb10-other@x.com'),
  ('0ba00000-0000-0000-0000-000000000003', 'rb10-pmup@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0ba00000-0000-0000-0000-000000000001', 'rb10-work@x.com',  'RB10 Work',  'rb10_work'),
  ('0ba00000-0000-0000-0000-000000000002', 'rb10-other@x.com', 'RB10 Other', 'rb10_work'),
  ('0ba00000-0000-0000-0000-000000000003', 'rb10-pmup@x.com',  'RB10 Pmup',  'rb10_pmup')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-039: voided with a reason, never deleted ---'
-- ===========================================================================
call public.nobody();
delete from public.indoor_jobs where serial in ('RB10-S1', 'RB10-S2');
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, demo_for_party, status, decontaminated) values
  ('Customer property', 'Repair', 'RB10 VENT', 'RB10-S1', 'RB10 HOSP', '', 'Received', true),
  ('Customer property', 'Repair', 'RB10 VENT', 'RB10-S2', 'RB10 HOSP', '', 'Received', false);
insert into public.indoor_job_accessories (job_id, name, serial)
select id, n, '' from public.indoor_jobs, (values ('RB10 CABLE'), ('RB10 MASK')) v(n) where serial = 'RB10-S1';
insert into public.indoor_job_checks (job_id, seq, parameter)
select id, 1, 'RB10 leak test' from public.indoor_jobs where serial = 'RB10-S1';
insert into public.indoor_job_parts (job_id, part_code, description, qty)
select id, 'RB10-P', 'RB10 board', 1 from public.indoor_jobs where serial = 'RB10-S1';
-- A job made in error, with an accessory recorded at intake.
insert into public.indoor_job_accessories (job_id, name, serial)
select id, 'RB10 ERROR CABLE', '' from public.indoor_jobs where serial = 'RB10-S2';

call public.be('rb10-work@x.com');
set role authenticated;
\echo 'expect ERROR: A harvested part is kept -- void it with a reason instead'
delete from public.indoor_job_parts where part_code = 'RB10-P';
\echo 'expect ERROR: An accessory is kept -- void it with a reason instead'
delete from public.indoor_job_accessories where name = 'RB10 MASK';
\echo 'expect ERROR: A check is kept -- void it with a reason instead'
delete from public.indoor_job_checks where parameter = 'RB10 leak test';
\echo 'expect ERROR: Give the reason for voiding this entry'
update public.indoor_job_accessories set voided_at = now(), void_reason = '  ' where name = 'RB10 MASK';
-- A void with a reason: the database writes who and when, whatever is sent.
update public.indoor_job_accessories
   set voided_at = '2020-01-01', voided_by = '0ba00000-0000-0000-0000-000000000002', void_reason = 'entered on the wrong unit'
 where name = 'RB10 MASK';
\echo 'expect ERROR: This entry was voided on'
update public.indoor_job_accessories set name = 'RB10 MASK CHANGED' where name = 'RB10 MASK';
-- A part cannot be inserted already voided.
insert into public.indoor_job_parts (job_id, part_code, description, qty, voided_at, void_reason)
select id, 'RB10-Q', 'RB10 fan', 1, now(), 'pre-voided' from public.indoor_jobs where serial = 'RB10-S1';
-- The honest edit still works.
update public.indoor_job_parts set qty = 2 where part_code = 'RB10-P';
reset role;
-- The whole job made in error is still deleted, with what was under it.
call public.be('rb10-work@x.com');
set role authenticated;
select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'RB10-S2'), 'raised on the wrong serial');
reset role;
call public.nobody();

do $$ begin
  if (select count(*) from public.indoor_job_parts p join public.indoor_jobs j on j.id = p.job_id where j.serial = 'RB10-S1') <> 2
     or (select count(*) from public.indoor_job_checks c join public.indoor_jobs j on j.id = c.job_id where j.serial = 'RB10-S1') <> 1 then
    raise exception 'D-039 FAILED: a part or a check was deleted';
  end if;
  if (select voided_by from public.indoor_job_accessories where name = 'RB10 MASK') is distinct from '0ba00000-0000-0000-0000-000000000001'
     or (select voided_at from public.indoor_job_accessories where name = 'RB10 MASK') < now() - interval '1 hour' then
    raise exception 'D-039 FAILED: the void was not stamped from the session';
  end if;
  if exists (select 1 from public.indoor_job_parts where part_code = 'RB10-Q' and voided_at is not null) then
    raise exception 'D-039 FAILED: a part was inserted already voided';
  end if;
  if (select qty from public.indoor_job_parts where part_code = 'RB10-P') <> 2 then
    raise exception 'D-039 FAILED: an honest edit was refused';
  end if;
  if (select accessory_count || '/' || accessories_outstanding || '/' || accessories_received
        from public.indoor_job_list where serial = 'RB10-S1') is distinct from '1/1/RB10 CABLE' then
    raise exception 'D-039 FAILED: the list counts a voided accessory: %',
      (select accessory_count || '/' || accessories_outstanding || '/' || accessories_received from public.indoor_job_list where serial = 'RB10-S1');
  end if;
  if (select pg_get_functiondef('public.create_indoor_dc'::regproc)) not like '%voided_at is null%' then
    raise exception 'D-039 FAILED: a new Indoor DC would carry a voided accessory';
  end if;
  if exists (select 1 from public.indoor_jobs where serial = 'RB10-S2')
     or exists (select 1 from public.indoor_job_accessories where name = 'RB10 ERROR CABLE') then
    raise exception 'D-039 FAILED: a job made in error could no longer be deleted with what was under it';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-038: which machines already have a PM call this month ---'
-- ===========================================================================
call public.nobody();
delete from public.pm_calls where serial like 'RB10-PM%';
insert into public.calls (ucn, call_type, party_name, product_name, serial, reg_date, allocated_to) values
  ('RB10-PM1', 'PM', 'RB10 HOSP', 'RB10 VENT', 'RB10-PMA', '2026-11-01', 'Somebody Else'),
  ('RB10-PM2', 'PM', 'RB10 HOSP', 'RB10 VENT', 'RB10-PMB', '2026-11-01', 'Somebody Else'),
  ('RB10-PM3', 'PM', 'RB10 HOSP', 'RB10 VENT', 'RB10-PMC', '2026-12-01', 'Somebody Else');
update public.pm_calls set cancelled_at = now() where ucn = 'RB10-PM2';
create temp table rb10_seen (who text, n bigint, own bigint);
grant all on rb10_seen to authenticated;
call public.be('rb10-pmup@x.com');
set role authenticated;
-- The uploader cannot see these calls (allocated to somebody else) ...
insert into rb10_seen select 'pmup',
  (select count(*) from public.pm_calls_in_month('2026-11-01') where serial like 'RB10-PM%'),
  (select count(*) from public.pm_calls where serial like 'RB10-PM%');
reset role;
call public.be('rb10-work@x.com');
set role authenticated;
\echo 'expect ERROR: pm.bulk_upload is required to check a PM upload against the month''s calls'
select count(*) from public.pm_calls_in_month('2026-11-01');
reset role;
call public.nobody();
do $$ begin
  -- ... and is still told the November one that is not cancelled, and only it.
  if (select n from rb10_seen where who = 'pmup') is distinct from 1 then
    raise exception 'D-038 FAILED: pm_calls_in_month gave % for November (want 1: not cancelled, not December)',
      (select n from rb10_seen where who = 'pmup');
  end if;
  if (select own from rb10_seen where who = 'pmup') is distinct from 0 then
    raise exception 'D-038 FAILED: the fixture is wrong -- the uploader can see the calls, so this proves nothing';
  end if;
end $$;

call public.nobody();
