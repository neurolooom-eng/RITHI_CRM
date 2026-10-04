-- ===========================================================================
-- REVIEW BATCH 4, PROVED ON A DATABASE (0349-0352).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-130  the review summary can be searched on every column the register names (0349)
--   2. D-137  a party or part named anywhere is not deleted; one named nowhere is (0350)
--   3. D-148  a re-load of an installation call on a dealer is not refused; a new one is (0351)
--   4. D-115  an uploaded Indoor report keeps its number (0352)
--
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb4_reader', 'RB4 Reader', '["calls.view", "review.edit"]'::jsonb),
 ('rb4_master', 'RB4 Master', '["masters.view", "masters.parties.delete", "masters.parts.delete"]'::jsonb),
 ('rb4_indoor', 'RB4 Indoor', '["mod:/indoor", "indoor.receive", "indoor.work"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b440000-0000-0000-0000-000000000001', 'rb4-admin@x.com'),
  ('0b440000-0000-0000-0000-000000000002', 'rb4-reader@x.com'),
  ('0b440000-0000-0000-0000-000000000003', 'rb4-master@x.com'),
  ('0b440000-0000-0000-0000-000000000004', 'rb4-indoor@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b440000-0000-0000-0000-000000000001', 'rb4-admin@x.com',  'RB4 Admin',  'admin'),
  ('0b440000-0000-0000-0000-000000000002', 'rb4-reader@x.com', 'RB4 Reader', 'rb4_reader'),
  ('0b440000-0000-0000-0000-000000000003', 'rb4-master@x.com', 'RB4 Master', 'rb4_master'),
  ('0b440000-0000-0000-0000-000000000004', 'rb4-indoor@x.com', 'RB4 Indoor', 'rb4_indoor')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-130: the summary carries every column the register searches ---'
-- ===========================================================================
call public.nobody();
insert into public.field_calls (ucn, call_number, party_name, allocated_to, standard_complaint, complaint_reported)
values ('RB4-F1', 'CN-RB4-F1', 'RB4 HOSP', 'RB4 Reader', 'RB4 NO POWER', 'rb4 does not start')
on conflict (ucn) do nothing;

call public.be('rb4-reader@x.com');
set role authenticated;
-- The search the register sends, over all ten columns, on the COUNT's view.
create temp table rb4_hits as
  select count(*) as n from public.field_call_review_summary
   where ucn ilike '%RB4%' or call_number ilike '%RB4%' or party_name ilike '%RB4%' or serial ilike '%RB4%'
      or product_name ilike '%RB4%' or allocated_to ilike '%RB4%' or standard_complaint ilike '%RB4%'
      or complaint_reported ilike '%RB4%' or complaint_grouping ilike '%RB4%' or root_cause_keyword ilike '%RB4%';
reset role;
do $$ begin
  if not exists (select 1 from rb4_hits) then
    raise exception 'D-130 FAILED: a search over the register''s columns could not be counted';
  end if;
  if (select reloptions from pg_class where oid = 'public.field_call_review_summary'::regclass)::text not like '%security_invoker=on%' then
    raise exception 'D-130 FAILED: the summary view lost security_invoker';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-137: a party or part named anywhere is not deleted ---'
-- ===========================================================================
call public.nobody();
delete from public.parties where party_name in ('RB4 DEALER', 'RB4 CONSIGNEE', 'RB4 NOBODY');
insert into public.parties (party_name, party_type) values
  ('RB4 DEALER', 'DEALER'), ('RB4 CONSIGNEE', 'CUSTOMER'), ('RB4 NOBODY', 'CUSTOMER');
insert into public.products (party_name, item_name, serial_number, sold_through)
  values ('RB4 CLINIC', 'RB4 VENT', 'RB4-S1', 'RB4 DEALER') on conflict (machine_key) do nothing;
insert into public.indoor_dcs (dc_no, consignee, authorised_by_name) values ('', 'RB4 CONSIGNEE', 'RB4 Someone');
insert into public.parts (code, item_detail) values ('RB4-P1', 'RB4-P1|RB4 PART') on conflict do nothing;
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, status, decontaminated)
  values ('Customer property', 'Repair', 'RB4 VENT', 'RB4-J1', 'RB4 CLINIC', 'Received', true);
insert into public.indoor_job_parts (job_id, part_code, qty)
  select id, 'RB4-P1|RB4 PART', 1 from public.indoor_jobs where serial = 'RB4-J1';

call public.be('rb4-master@x.com');
set role authenticated;
\echo 'expect ERROR: This party is still named on 1 record(s) — 1 machines (Sold Through)'
delete from public.parties where party_name = 'RB4 DEALER';
\echo 'expect ERROR: This party is still named on 1 record(s) — 1 indoor dcs (consignee)'
delete from public.parties where party_name = 'RB4 CONSIGNEE';
\echo 'expect ERROR: This part is still named on 1 record(s) — 1 indoor job parts'
delete from public.parts where item_detail = 'RB4-P1|RB4 PART';
delete from public.parties where party_name = 'RB4 NOBODY';
reset role;
do $$ begin
  if (select count(*) from public.parties where party_name in ('RB4 DEALER', 'RB4 CONSIGNEE')) <> 2 then
    raise exception 'D-137 FAILED: a party still named as Sold Through or as a consignee was deleted';
  end if;
  if not exists (select 1 from public.parts where item_detail = 'RB4-P1|RB4 PART') then
    raise exception 'D-137 FAILED: a part on an indoor job was deleted';
  end if;
  if exists (select 1 from public.parties where party_name = 'RB4 NOBODY') then
    raise exception 'D-137 FAILED: a party named nowhere can no longer be deleted';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 3. D-148: a re-load of a call on a dealer is not refused; a new one is ---'
-- ===========================================================================
-- A call raised on the dealer before 0328 (a load: no session).
call public.nobody();
-- A dealer of its own: section 2 may have deleted RB4 DEALER on a database
-- without 0350, and this section must not depend on that.
delete from public.parties where party_name = 'RB4 DEALER 3';
insert into public.parties (party_name, party_type) values ('RB4 DEALER 3', 'DEALER');
delete from public.installation_calls where ucn in ('RB4-I1', 'RB4-I2', 'RB4-I3');
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number)
values ('RB4-I1', 'INSTALLATION', 'RB4 VENT', 'RB4-S1', current_date, 'RB4 DEALER 3', 'WI-RB4 VENT-RB4-S1'),
       ('RB4-I3', 'INSTALLATION', 'RB4 VENT', 'RB4-S3', current_date, 'RB4 CLINIC', 'WI-RB4 VENT-RB4-S3');

call public.be('rb4-admin@x.com');
set role authenticated;
-- The upload's upsert on ucn, party unchanged (case and spaces differ).
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number, customer_name)
values ('RB4-I1', 'INSTALLATION', 'RB4 VENT', 'RB4-S1', current_date, ' rb4 dealer 3', 'WI-RB4 VENT-RB4-S1', 'RE-LOADED')
on conflict (ucn) do update set customer_name = excluded.customer_name;
\echo 'expect ERROR: RB4 DEALER 3 is a dealer: an installation call is not raised for a dealer'
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number)
values ('RB4-I2', 'INSTALLATION', 'RB4 VENT', 'RB4-S2', current_date, 'RB4 DEALER 3', 'WI-RB4 VENT-RB4-S2');
\echo 'expect ERROR: RB4 DEALER 3 is a dealer: an installation call is not raised for a dealer'
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number)
values ('RB4-I3', 'INSTALLATION', 'RB4 VENT', 'RB4-S3', current_date, 'RB4 DEALER 3', 'WI-RB4 VENT-RB4-S3')
on conflict (ucn) do update set party_name = excluded.party_name;
reset role;
do $$ begin
  if (select customer_name from public.installation_calls where ucn = 'RB4-I1') is distinct from 'RE-LOADED' then
    raise exception 'D-148 FAILED: a re-load of a call already on a dealer was refused';
  end if;
  if exists (select 1 from public.installation_calls where ucn = 'RB4-I2') then
    raise exception 'D-148 FAILED: a NEW installation call for a dealer was accepted';
  end if;
  if (select party_name from public.installation_calls where ucn = 'RB4-I3') is distinct from 'RB4 CLINIC' then
    raise exception 'D-148 FAILED: a re-load moved a call onto a dealer';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 4. D-115: an uploaded Indoor report keeps its number ---'
-- ===========================================================================
call public.nobody();
update public.indoor_jobs
   set cleaned_at = now(), status = 'Cleaned', indoor_report_no = 'ISR-RB4',
       report_file_url = 'https://drive/isr-rb4', report_file_name = 'ISR-RB4.pdf'
 where serial = 'RB4-J1';

call public.be('rb4-indoor@x.com');
set role authenticated;
\echo 'expect ERROR: This job has an uploaded Indoor Service Report, so its Indoor Service Report No cannot be blank'
update public.indoor_jobs set indoor_report_no = '' where serial = 'RB4-J1';
reset role;
do $$ begin
  if (select indoor_report_no from public.indoor_jobs where serial = 'RB4-J1') is distinct from 'ISR-RB4' then
    raise exception 'D-115 FAILED: the number of an uploaded report was blanked';
  end if;
end $$;
call public.be('rb4-indoor@x.com');
set role authenticated;
-- A correction to another number is still allowed.
update public.indoor_jobs set indoor_report_no = 'ISR-RB4-A' where serial = 'RB4-J1';
reset role;
do $$ begin
  if (select indoor_report_no from public.indoor_jobs where serial = 'RB4-J1') is distinct from 'ISR-RB4-A' then
    raise exception 'D-115 FAILED: the number was blanked, or a correction was refused';
  end if;
end $$;

-- A job WITHOUT a report can still clear its number.
call public.nobody();
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, status, indoor_report_no)
  values ('Customer property', 'Repair', 'RB4 VENT', 'RB4-J2', 'RB4 CLINIC', 'Received', 'ISR-DRAFT');
call public.be('rb4-indoor@x.com');
set role authenticated;
update public.indoor_jobs set indoor_report_no = '' where serial = 'RB4-J2';
reset role;
do $$ begin
  if (select indoor_report_no from public.indoor_jobs where serial = 'RB4-J2') <> '' then
    raise exception 'D-115 FAILED: a job with no report can no longer clear its number';
  end if;
end $$;

call public.nobody();
