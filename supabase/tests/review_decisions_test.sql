-- ===========================================================================
-- THE USER'S DECISIONS OF 2026-10-04, PROVED ON A DATABASE (0359-0363).
-- Each section proves BOTH halves: what the decision refuses is refused, AND
-- the honest path beside it still works.
--
--   1. D-125  a visit, its spares and a spare request are filed under your own
--             name, your team's, or anybody's only with the key (0359)
--   2. D-125  created_by on a consumption line is the session (0359)
--   3. D-145  approving an Indoor DC skips the visit of a call already Solved (0360)
--   4. D-112  the dispatch date is when the unit is marked Dispatched (0363)
--   5. D-114  a cleaning time may be earlier, never later; who is the session (0363)
--   6. D-149  a transfer correction blanks Sold Through only where a transfer set it (0361)
--   7. D-150  one installation call per call number and per machine (0362)
--   8. D-154  no installation request for a dealer (0362)
--
-- D-111 (the signed PDT lock and Un-sign) is proved in indoor_register_pdt_test
-- section 7; the definer and Reconciliation exemptions of D-125 are exercised
-- by indoor_stages_test (the approver files the unit's visit in the
-- engineer's name) and reconciliation_needs_no_visit_test (the coordinator
-- books in the engineer's name) -- both pass with 0359 in.
--
-- Superuser bypasses RLS and is not `authenticated`, so every check that
-- matters runs `set role authenticated`. Run ONCE after _stub.sql + every
-- migration. Every error printed is labelled `expect ERROR` -- anything else
-- is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('d5_eng',    'D5 Engineer', '["calls.view", "calls.report", "visit.spares", "spare.request"]'::jsonb),
 ('d5_mgr',    'D5 Manager',  '["calls.view", "calls.report", "visit.spares", "spare.request", "mod:/indoor"]'::jsonb),
 ('d5_loader', 'D5 Loader',   '["calls.view", "calls.report", "visit.spares", "bulk.upload"]'::jsonb),
 ('d5_indoor', 'D5 Indoor',   '["mod:/indoor", "indoor.receive", "indoor.work", "indoor.qc", "indoor.dispatch"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
-- Technical Support is given spare.request.others ONCE by 0359; it needs
-- spare.request to raise anything at all. MERGED, so the migration's grant stays.
update public.app_roles set permissions = permissions || '["spare.request"]'::jsonb
 where role = 'technical_support' and not (permissions ? 'spare.request');

insert into auth.users (id, email) values
  ('0d500000-0000-0000-0000-000000000001', 'd5-ajay@x.com'),
  ('0d500000-0000-0000-0000-000000000002', 'd5-mgr@x.com'),
  ('0d500000-0000-0000-0000-000000000003', 'd5-stranger@x.com'),
  ('0d500000-0000-0000-0000-000000000004', 'd5-office@x.com'),
  ('0d500000-0000-0000-0000-000000000005', 'd5-tech@x.com'),
  ('0d500000-0000-0000-0000-000000000006', 'd5-loader@x.com'),
  ('0d500000-0000-0000-0000-000000000007', 'd5-indoor@x.com'),
  ('0d500000-0000-0000-0000-000000000008', 'd5-admin@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, extra_permissions) values
  ('0d500000-0000-0000-0000-000000000001', 'd5-ajay@x.com',     'D5 Ajay',     'd5_eng',            '[]'::jsonb),
  ('0d500000-0000-0000-0000-000000000002', 'd5-mgr@x.com',      'D5 Manager',  'd5_mgr',            '[]'::jsonb),
  ('0d500000-0000-0000-0000-000000000003', 'd5-stranger@x.com', 'D5 Stranger', 'd5_eng',            '[]'::jsonb),
  ('0d500000-0000-0000-0000-000000000004', 'd5-office@x.com',   'D5 Office',   'd5_eng',            '["visit.others"]'::jsonb),
  ('0d500000-0000-0000-0000-000000000005', 'd5-tech@x.com',     'D5 Tech',     'technical_support', '[]'::jsonb),
  ('0d500000-0000-0000-0000-000000000006', 'd5-loader@x.com',   'D5 Loader',   'd5_loader',         '[]'::jsonb),
  ('0d500000-0000-0000-0000-000000000007', 'd5-indoor@x.com',   'D5 Indoor',   'd5_indoor',         '[]'::jsonb),
  ('0d500000-0000-0000-0000-000000000008', 'd5-admin@x.com',    'D5 Admin',    'admin',             '[]'::jsonb)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name,
                               extra_permissions = excluded.extra_permissions;

-- THE USER MASTER: Ajay and the indoor engineer report to D5 Manager; the
-- stranger reports to nobody here.
delete from public.user_directory where email like 'd5-%@x.com';
insert into public.user_directory (name, email, reporting_manager, regional_manager) values
  ('D5 Ajay',     'd5-ajay@x.com',     'D5 Manager', ''),
  ('D5 Manager',  'd5-mgr@x.com',      '',           ''),
  ('D5 Stranger', 'd5-stranger@x.com', 'D5 Elsewhere', ''),
  ('D5 Office',   'd5-office@x.com',   '',           ''),
  ('D5 Tech',     'd5-tech@x.com',     '',           ''),
  ('D5 Indoor',   'd5-indoor@x.com',   'D5 Manager', '');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- One call, a visit on it (a spare needs one, 0214), and stock in every hand.
call public.nobody();
insert into public.field_calls (ucn, call_number, party_name, allocated_to)
values ('D5-C1', 'CN-D5-C1', 'D5 HOSP', 'D5 Ajay') on conflict (ucn) do nothing;
insert into public.reports (uid, ucn, call_number, engineer, visit_at, updated_at, call_status)
values ('D5-V0', 'D5-C1', 'CN-D5-C1', 'D5 Ajay', now() - interval '1 hour', now() - interval '1 hour', 'Unsolved');
insert into public.handstock_opening (engineer, part, qty, as_of, source)
select e, 'KY550200|MOTHER BOARD - OSIRIS 3', 10, current_date, 'test'
  from unnest(array['D5 Ajay', 'D5 Stranger', 'D5 Manager']) e;

-- ===========================================================================
\echo ''
\echo '--- 1a. D-125 VISITS: own name, team, the key; a stranger''s name refused ---'
-- ===========================================================================
call public.be('d5-ajay@x.com');
set role authenticated;
insert into public.reports (uid, ucn, call_number, engineer, visit_at, updated_at)
values ('D5-V1', 'D5-C1', 'CN-D5-C1', 'D5 Ajay', now(), now());
\echo 'expect ERROR: D5 Stranger is not you or an engineer in your team, so this visit cannot be filed in their name'
insert into public.reports (uid, ucn, call_number, engineer, visit_at, updated_at)
values ('D5-V2', 'D5-C1', 'CN-D5-C1', 'D5 Stranger', now(), now());
\echo 'expect ERROR: D5 Stranger is not you or an engineer in your team (moving a visit onto them)'
update public.reports set engineer = 'D5 Stranger' where uid = 'D5-V1';
-- Changing something else on a visit filed for somebody else is not a re-filing.
update public.reports set call_status = 'Unsolved' where uid = 'D5-V1';
reset role;

call public.be('d5-mgr@x.com');
set role authenticated;
insert into public.reports (uid, ucn, call_number, engineer, visit_at, updated_at)
values ('D5-V3', 'D5-C1', 'CN-D5-C1', 'd5 ajay ', now(), now());
\echo 'expect ERROR: D5 Stranger is not you or an engineer in your team (a manager, outside their team)'
insert into public.reports (uid, ucn, call_number, engineer, visit_at, updated_at)
values ('D5-V4', 'D5-C1', 'CN-D5-C1', 'D5 Stranger', now(), now());
reset role;

call public.be('d5-office@x.com');
set role authenticated;
insert into public.reports (uid, ucn, call_number, engineer, visit_at, updated_at)
values ('D5-V5', 'D5-C1', 'CN-D5-C1', 'D5 Stranger', now(), now());
reset role;

call public.be('d5-loader@x.com');
set role authenticated;
insert into public.reports (uid, ucn, call_number, engineer, visit_at, updated_at)
values ('D5-V6', 'D5-C1', 'CN-D5-C1', 'D5 Stranger', now(), now());
reset role;
call public.nobody();

do $$ begin
  if (select string_agg(uid, ',' order by uid) from public.reports where uid like 'D5-V%' and uid <> 'D5-V0')
     is distinct from 'D5-V1,D5-V3,D5-V5,D5-V6' then
    raise exception 'D-125 FAILED (visits): expected D5-V1,V3,V5,V6, got %',
      (select string_agg(uid, ',' order by uid) from public.reports where uid like 'D5-V%' and uid <> 'D5-V0');
  end if;
  if (select engineer from public.reports where uid = 'D5-V1') <> 'D5 Ajay' then
    raise exception 'D-125 FAILED: a visit was moved onto a stranger';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 1b. D-125 SPARES ON A VISIT: the same rule ---'
-- ===========================================================================
call public.be('d5-ajay@x.com');
set role authenticated;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, source, remarks)
values ('D5-C1', 'CN-D5-C1', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'D5 Ajay', 'Report', 'D5-S-OWN');
\echo 'expect ERROR: D5 Stranger is not you or an engineer in your team, so this spare consumption cannot be filed in their name'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, source, remarks)
values ('D5-C1', 'CN-D5-C1', 'KY550200|MOTHER BOARD - OSIRIS 3', 2, 'D5 Stranger', 'Report', 'D5-S-STRANGER');
reset role;

call public.be('d5-mgr@x.com');
set role authenticated;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, source, remarks)
values ('D5-C1', 'CN-D5-C1', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'D5 Ajay', 'Report', 'D5-S-TEAM');
reset role;

call public.be('d5-office@x.com');
set role authenticated;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, source, remarks)
values ('D5-C1', 'CN-D5-C1', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'D5 Stranger', 'Report', 'D5-S-KEY');
reset role;
call public.nobody();

do $$ begin
  if (select string_agg(remarks, ',' order by remarks) from public.spare_consumption where remarks like 'D5-S-%')
     is distinct from 'D5-S-KEY,D5-S-OWN,D5-S-TEAM' then
    raise exception 'D-125 FAILED (spares): got %',
      (select string_agg(remarks, ',' order by remarks) from public.spare_consumption where remarks like 'D5-S-%');
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 1c. D-125 SPARE REQUESTS: own, team, Technical Support; visit.others is not enough ---'
-- ===========================================================================
call public.be('d5-ajay@x.com');
set role authenticated;
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn, handstock_reason)
values ('D5-R1', 'HandStock', 'D5 Ajay', 'd5-ajay@x.com', '', '', 'boot stock');
\echo 'expect ERROR: D5 Stranger is not you or an engineer in your team, so this spare request cannot be filed in their name'
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn, handstock_reason)
values ('D5-R2', 'HandStock', 'D5 Stranger', 'd5-stranger@x.com', '', '', 'boot stock');
reset role;

call public.be('d5-mgr@x.com');
set role authenticated;
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn, handstock_reason)
values ('D5-R3', 'HandStock', 'D5 Ajay', 'd5-ajay@x.com', '', '', 'boot stock');
reset role;

call public.be('d5-office@x.com');
set role authenticated;
\echo 'expect ERROR: D5 Stranger is not you or an engineer in your team, so this spare request cannot be filed in their name'
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn, handstock_reason)
values ('D5-R4', 'HandStock', 'D5 Stranger', 'd5-stranger@x.com', '', '', 'boot stock');
reset role;

call public.be('d5-tech@x.com');
set role authenticated;
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn, handstock_reason)
values ('D5-R5', 'HandStock', 'D5 Stranger', 'd5-stranger@x.com', '', '', 'boot stock');
reset role;
call public.nobody();

do $$ begin
  if (select string_agg(uid, ',' order by uid) from public.spare_requests where uid like 'D5-R%')
     is distinct from 'D5-R1,D5-R3,D5-R5' then
    raise exception 'D-125 FAILED (spare requests): got %',
      (select string_agg(uid, ',' order by uid) from public.spare_requests where uid like 'D5-R%');
  end if;
  if not (select permissions ? 'spare.request.others' from public.app_roles where role = 'technical_support') then
    raise exception 'D-125 FAILED: Technical Support was not given spare.request.others';
  end if;
  if exists (select 1 from public.app_roles where permissions ? 'visit.others') then
    raise exception 'D-125 FAILED: visit.others was given to a role -- it is ticked per person';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-125 created_by ON A CONSUMPTION LINE IS THE SESSION ---'
-- ===========================================================================
call public.be('d5-ajay@x.com');
set role authenticated;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, source, remarks, created_by)
values ('D5-C1', 'CN-D5-C1', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'D5 Ajay', 'Report', 'D5-CB',
        '0d500000-0000-0000-0000-000000000003');
reset role;
call public.nobody();
do $$ begin
  if (select created_by from public.spare_consumption where remarks = 'D5-CB')
     is distinct from '0d500000-0000-0000-0000-000000000001'::uuid then
    raise exception 'D-125 FAILED: created_by kept the value the caller sent';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 3. D-145: APPROVAL SKIPS THE VISIT OF A CALL ALREADY SOLVED ---'
-- ===========================================================================
call public.nobody();
insert into public.field_calls (ucn, call_number, party_name) values
  ('D5-IN-1', 'CN-D5-IN-1', 'D5 HOSP'), ('D5-IN-2', 'CN-D5-IN-2', 'D5 HOSP')
on conflict (ucn) do nothing;
-- D5-IN-1 was closed in the field while its unit was in the workshop.
insert into public.reports (uid, ucn, call_number, engineer, visit_at, updated_at, call_status)
values ('D5-IN-V1', 'D5-IN-1', 'CN-D5-IN-1', 'D5 Indoor', now() - interval '2 hours', now() - interval '2 hours',
        'Solved - Report Completed');

call public.be('d5-indoor@x.com');
insert into public.indoor_jobs (kind, activity, ucn, product_name, serial, party_name, demo_for_party, status, qc_result) values
 ('Customer property', 'Repair', 'D5-IN-1', 'D5 VENT', 'D5-J1', 'D5 HOSP', '', 'Received', 'Pass'),
 ('Customer property', 'Repair', 'D5-IN-2', 'D5 VENT', 'D5-J2', 'D5 HOSP', '', 'Received', 'Pass');
update public.indoor_jobs set cleaned_at = now(), status = 'Cleaned' where serial in ('D5-J1', 'D5-J2');
set role authenticated;
update public.indoor_jobs
   set indoor_report_no = 'ISR-' || serial, report_file_url = 'https://drive/' || serial,
       visit_draft = '{"status": "Unsolved"}'::jsonb, visit_date = current_date
 where serial in ('D5-J1', 'D5-J2');
reset role;
update public.indoor_jobs set status = 'Ready' where serial in ('D5-J1', 'D5-J2');

set role authenticated;
select public.create_indoor_dc(array(select id from public.indoor_jobs where serial in ('D5-J1', 'D5-J2') order by serial),
                               'D5 HOSP', p_authorised_by => 'D5 Manager') as d5dc \gset
reset role;

call public.be('d5-mgr@x.com');
set role authenticated;
select public.approve_indoor_dc(:'d5dc') as d5approved \gset
reset role;
call public.nobody();
\echo 'expect: the DC number, then "visit not filed, call already Solved: D5-IN-1"'
select :'d5approved' as approval_says;
select set_config('d5.dc', :'d5dc', false) \g /dev/null
select set_config('d5.approved', :'d5approved', false) \g /dev/null
do $$ begin
  if (select approval_status from public.indoor_dcs where dc_no = current_setting('d5.dc')) <> 'Approved' then
    raise exception 'D-145 FAILED: the DC was not approved';
  end if;
  if current_setting('d5.approved') not like '%visit not filed, call already Solved: D5-IN-1%' then
    raise exception 'D-145 FAILED: the approval did not say which visit it skipped (%)', current_setting('d5.approved');
  end if;
  if exists (select 1 from public.indoor_jobs where serial = 'D5-J1' and visit_uid is not null) then
    raise exception 'D-145 FAILED: a visit was filed on a call already Solved';
  end if;
  if (select call_status from public.reports r join public.indoor_jobs j on j.ucn = r.ucn
       where j.serial = 'D5-J1' order by r.updated_at desc, r.id desc limit 1) <> 'Solved - Report Completed' then
    raise exception 'D-145 FAILED: the Solved call was reopened';
  end if;
  if not exists (select 1 from public.indoor_jobs where serial = 'D5-J2' and visit_uid like 'WEB-%') then
    raise exception 'D-145 FAILED: the unit on an open call no longer files its visit';
  end if;
  if not exists (select 1 from public.audit_log where action = 'indoor.visit_skipped' and target like '%D5-IN-1%'
                   or (action = 'indoor.visit_skipped' and meta::text like '%D5-IN-1%')) then
    raise exception 'D-145 FAILED: the skipped visit was not written to the audit log';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 4. D-112: THE DISPATCH DATE IS WHEN IT IS MARKED DISPATCHED ---'
-- ===========================================================================
do $$ begin
  if exists (select 1 from public.indoor_jobs where serial in ('D5-J1', 'D5-J2') and dispatched_at is not null) then
    raise exception 'D-112 FAILED: an approved unit, still Ready, already carries a dispatch date';
  end if;
end $$;
call public.be('d5-indoor@x.com');
set role authenticated;
update public.indoor_jobs set status = 'Dispatched', dispatched_by = '0d500000-0000-0000-0000-000000000003'
 where serial = 'D5-J1';
reset role;
call public.nobody();
do $$ begin
  if not exists (select 1 from public.indoor_jobs where serial = 'D5-J1' and dispatched_at > now() - interval '1 minute'
                    and dispatched_by = '0d500000-0000-0000-0000-000000000007') then
    raise exception 'D-112 FAILED: marking it Dispatched did not stamp now and the session';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 5. D-114: A CLEANING TIME MAY BE EARLIER, NEVER LATER; WHO IS THE SESSION ---'
-- ===========================================================================
call public.be('d5-indoor@x.com');
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, status)
values ('Customer property', 'Repair', 'D5 VENT', 'D5-J3', 'D5 HOSP', 'Received');
set role authenticated;
\echo 'expect ERROR: A cleaning cannot be recorded in the future'
update public.indoor_jobs set cleaned_at = now() + interval '2 days', status = 'Cleaned' where serial = 'D5-J3';
update public.indoor_jobs set cleaned_at = now() - interval '3 days', status = 'Cleaned',
                              cleaned_by = '0d500000-0000-0000-0000-000000000003'
 where serial = 'D5-J3';
reset role;
call public.nobody();
do $$ begin
  if not exists (select 1 from public.indoor_jobs where serial = 'D5-J3'
                    and cleaned_at < now() - interval '2 days'
                    and cleaned_by = '0d500000-0000-0000-0000-000000000007') then
    raise exception 'D-114 FAILED: an earlier cleaning time was refused, or cleaned_by is not the session';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 6. D-149: A TRANSFER CORRECTION BLANKS SOLD THROUGH ONLY WHERE A TRANSFER SET IT ---'
-- ===========================================================================
call public.nobody();
delete from public.parties where party_name in ('D5 DEALER', 'D5 CLINIC', 'D5 CLINIC 2', 'D5 UPLOAD DEALER');
insert into public.parties (party_name, party_type) values
  ('D5 DEALER', 'DEALER'), ('D5 CLINIC', 'CUSTOMER'), ('D5 CLINIC 2', 'CUSTOMER'), ('D5 UPLOAD DEALER', 'DEALER');
-- Three machines with NO sale entry. T2's Sold Through came from an upload.
insert into public.products (party_name, item_name, serial_number, sold_through) values
  ('D5 DEALER', 'D5 VENT', 'D5-T1', ''),
  ('D5 CLINIC', 'D5 VENT', 'D5-T2', 'D5 UPLOAD DEALER'),
  ('D5 DEALER', 'D5 VENT', 'D5-T3', ''),
  ('D5 DEALER', 'D5 VENT', 'D5-T4', '')
on conflict (machine_key) do nothing;

call public.be('d5-admin@x.com');
set role authenticated;
insert into public.ownership_transfers (serial_number, item_name, from_party, to_party, transfer_date, reference_no) values
  ('D5-T1', 'D5 VENT', 'D5 DEALER', 'D5 CLINIC',   current_date, 'D5-OT-1'),
  ('D5-T2', 'D5 VENT', 'D5 CLINIC', 'D5 CLINIC 2', current_date, 'D5-OT-2'),
  ('D5-T3', 'D5 VENT', 'D5 DEALER', 'D5 CLINIC',   current_date, 'D5-OT-3');
reset role;
call public.nobody();
do $$ begin
  if (select sold_through from public.products where serial_number = 'D5-T1') <> 'D5 DEALER' then
    raise exception 'D-149 FAILED: a dealer transfer did not set Sold Through';
  end if;
end $$;

call public.be('d5-admin@x.com');
set role authenticated;
-- The From party was wrong: it was the clinic all along.
update public.ownership_transfers set from_party = 'D5 CLINIC 2' where reference_no = 'D5-OT-1';
-- The transfer was keyed on the wrong machine.
update public.ownership_transfers set serial_number = 'D5-T4' where reference_no = 'D5-OT-3';
reset role;
call public.nobody();
do $$ begin
  if coalesce((select sold_through from public.products where serial_number = 'D5-T1'), '') <> '' then
    raise exception 'D-149 FAILED: the dealer a transfer set stayed after the transfer was corrected';
  end if;
  if (select sold_through from public.products where serial_number = 'D5-T2') <> 'D5 UPLOAD DEALER' then
    raise exception 'D-149 FAILED: a Sold Through from an upload was blanked by a transfer';
  end if;
  if coalesce((select sold_through from public.products where serial_number = 'D5-T3'), '') <> '' then
    raise exception 'D-149 FAILED: the machine a transfer moved away from was not re-read';
  end if;
  if (select sold_through from public.products where serial_number = 'D5-T4') <> 'D5 DEALER' then
    raise exception 'D-149 FAILED: the machine a transfer moved to did not take its dealer';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 7. D-150: ONE INSTALLATION CALL PER CALL NUMBER AND PER MACHINE ---'
-- ===========================================================================
call public.nobody();
delete from public.installation_calls where ucn like 'D5-I%';
call public.be('d5-admin@x.com');
set role authenticated;
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number)
values ('D5-I1', 'INSTALLATION', 'D5 VENT', 'D5-M1', current_date, 'D5 CLINIC', 'OT-D5 VENT-D5-M1');
\echo 'expect ERROR: Installation call D5-I1 already carries call number OT-D5 VENT-D5-M1'
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number)
values ('D5-I2', 'INSTALLATION', 'D5 VENT', 'D5-M9', current_date, 'D5 CLINIC', 'ot-d5 vent-d5-m1 ');
\echo 'expect ERROR: D5 VENT D5-M1 already has installation call D5-I1'
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number)
values ('D5-I3', 'INSTALLATION', 'D5 VENT', 'd5-m1', current_date, 'D5 CLINIC', 'WI-D5 VENT-D5-M1');
-- A re-load of the same call (the upload's upsert on ucn) is not a second call.
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number, customer_name)
values ('D5-I1', 'INSTALLATION', 'D5 VENT', 'D5-M1', current_date, 'D5 CLINIC', 'OT-D5 VENT-D5-M1', 'RE-LOADED')
on conflict (ucn) do update set customer_name = excluded.customer_name;
reset role;
-- Once the first is cancelled, the machine can have its installation call.
call public.nobody();
update public.installation_calls set cancelled_at = now() where ucn = 'D5-I1';
call public.be('d5-admin@x.com');
set role authenticated;
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name, call_number)
values ('D5-I4', 'INSTALLATION', 'D5 VENT', 'D5-M1', current_date, 'D5 CLINIC', 'OT-D5 VENT-D5-M1');
reset role;
call public.nobody();
do $$ begin
  if (select string_agg(ucn, ',' order by ucn) from public.installation_calls where ucn like 'D5-I%')
     is distinct from 'D5-I1,D5-I4' then
    raise exception 'D-150 FAILED: got %',
      (select string_agg(ucn, ',' order by ucn) from public.installation_calls where ucn like 'D5-I%');
  end if;
  if (select customer_name from public.installation_calls where ucn = 'D5-I1') is distinct from 'RE-LOADED' then
    raise exception 'D-150 FAILED: a re-load of the same call was refused';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 8. D-154: NO INSTALLATION REQUEST FOR A DEALER ---'
-- ===========================================================================
call public.nobody();
delete from public.call_requests where reqid in ('D5RQ1', 'D5RQ2', 'D5RQ3');
-- A request on the dealer from before 0362 (a load: no session).
insert into public.call_requests (reqid, engineer, call_type, party_name, product, serial_no)
values ('D5RQ3', 'D5 Ajay', 'INSTALLATION CALL', 'D5 DEALER', 'D5 VENT', 'D5-Q3');
call public.be('d5-admin@x.com');
set role authenticated;
\echo 'expect ERROR: D5 DEALER is a dealer: an installation call is not raised for a dealer'
insert into public.call_requests (reqid, engineer, call_type, party_name, product, serial_no)
values ('D5RQ1', 'D5 Ajay', 'INSTALLATION CALL', ' d5 dealer', 'D5 VENT', 'D5-Q1');
insert into public.call_requests (reqid, engineer, call_type, party_name, product, serial_no)
values ('D5RQ2', 'D5 Ajay', 'INSTALLATION CALL', 'D5 CLINIC', 'D5 VENT', 'D5-Q2');
-- A FIELD call for the dealer is not an installation and is not refused.
insert into public.call_requests (reqid, engineer, call_type, party_name, product, serial_no)
values ('D5RQ2', 'D5 Ajay', 'FIELD', 'D5 DEALER', 'D5 VENT', 'D5-Q4');
\echo 'expect ERROR: D5 DEALER is a dealer (moving an installation request onto a dealer)'
update public.call_requests set party_name = 'D5 DEALER' where reqid = 'D5RQ2' and serial_no = 'D5-Q2';
-- Changing something else on the old request on the dealer is not refused.
update public.call_requests set engineer = 'D5 Manager' where reqid = 'D5RQ3';
reset role;
call public.nobody();
do $$ begin
  if exists (select 1 from public.call_requests where reqid = 'D5RQ1') then
    raise exception 'D-154 FAILED: an installation request for a dealer was accepted';
  end if;
  if (select count(*) from public.call_requests where reqid = 'D5RQ2') <> 2 then
    raise exception 'D-154 FAILED: a request for a customer, or a field request for a dealer, was refused';
  end if;
  if (select party_name from public.call_requests where reqid = 'D5RQ2' and serial_no = 'D5-Q2') <> 'D5 CLINIC' then
    raise exception 'D-154 FAILED: an installation request was moved onto a dealer';
  end if;
  if (select engineer from public.call_requests where reqid = 'D5RQ3') <> 'D5 Manager' then
    raise exception 'D-154 FAILED: an unrelated edit of an old request on a dealer was refused';
  end if;
end $$;

call public.nobody();
