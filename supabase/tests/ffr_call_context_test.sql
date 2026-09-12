-- ===========================================================================
-- THE VISITS AND SPARES BEHIND A FIELD FAILURE REPORT (0178).
--
--   Reported from use with two screenshots: an ADMINISTRATOR saw the visit work
--   and the spares in the register's right-hand pane; a user on a role granted
--   `ffr.view` saw "0 visits" and "Nothing booked against this call" on the
--   SAME report. `reports` and `spare_consumption` are scoped to CALL
--   visibility, which reading the register does not confer.
--   The function returns them to somebody who may read the register — and ONLY
--   for a UCN that actually HAS a report, so it is not a general call reader.
--   It returns NULL to anybody else, and the application then reads the tables
--   under that person's own policies: nobody loses a visit they could see.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('vptechnical', 'VP Technical',
  '["mod:/failure-report","calls.view","reports.view","ffr.manage","ffr.view"]'::jsonb),
 ('noffr', 'No FFR', '["mod:/failure-report","calls.view","reports.view"]'::jsonb)
on conflict (role) do update set label = excluded.label, permissions = excluded.permissions;

insert into auth.users (id,email) values
 ('bb000000-0000-0000-0000-000000000001','vp@x.com'),
 ('bb000000-0000-0000-0000-000000000002','own@x.com'),
 ('bb000000-0000-0000-0000-000000000003','none@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('bb000000-0000-0000-0000-000000000001','vp@x.com','VP Person','vptechnical'),
 ('bb000000-0000-0000-0000-000000000002','own@x.com','Own Engineer','engineer'),
 ('bb000000-0000-0000-0000-000000000003','none@x.com','No FFR Person','noffr')
on conflict (id) do update set role = excluded.role;
insert into public.user_directory (name, email, role) values
 ('VP Person','vp@x.com','vptechnical'),
 ('Own Engineer','own@x.com','engineer'),
 ('No FFR Person','none@x.com','noffr')
on conflict do nothing;

-- A call allotted to the engineer, with two visits and a spare, and a report
-- raised on it. Plus a call with NO report, to prove the function will not open
-- one.
insert into public.field_calls (ucn, call_number, call_type, party_name, product_name, allocated_to, reg_date)
values ('F-CTX-1','CN-CTX-1','Field Call','KING EDWARD','MONNAL T60','Own Engineer', current_date),
       ('F-CTX-2','CN-CTX-2','Field Call','OTHER HOSP','MONNAL T75','Own Engineer', current_date);
insert into public.reports (uid, ucn, call_number, engineer, visit_at, data) values
 ('V1','F-CTX-1','CN-CTX-1','VISHAL', current_date, '{"Job Done":"Replaced sensor"}'::jsonb),
 ('V2','F-CTX-1','CN-CTX-1','VISHAL', current_date - 1, '{"Job Done":"Checked board"}'::jsonb),
 ('V3','F-CTX-2','CN-CTX-2','VISHAL', current_date, '{"Job Done":"Not an FFR call"}'::jsonb);
-- HAND STOCK FIRST. A consumption line is CAPPED at the engineer's balance by a
-- database trigger (0061) — "0 of PRESSURE SENSOR in hand, so 1 cannot be
-- consumed" — which is the control working, and which the first version of this
-- test walked straight into. Opening stock is the legitimate way to give them
-- the part.
insert into public.handstock_opening (engineer, part, qty, as_of, source, remarks)
values ('Own Engineer', 'PRESSURE SENSOR', 5, current_date, 'Opening', 'test seed');
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
values ('F-CTX-1','CN-CTX-1','PRESSURE SENSOR', 1, 'Own Engineer','own@x.com');
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported)
values ('FFR - 500/26','PC','F-CTX-1', current_date, 'KING EDWARD', 'touch failure');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo ''
\echo '--- 1. THE REPORTED CASE: ffr.view, but no call visibility ---'
call public.be('vp@x.com');
set role authenticated;
-- What the pane used to do: read the tables directly. Still nothing, and that
-- is the fault as reported — asserted so the fix cannot be claimed by accident.
select count(*) as direct_visits_still_0 from public.reports where ucn = 'F-CTX-1';
select count(*) as direct_spares_still_0 from public.spare_consumption where ucn = 'F-CTX-1';
-- What it does now.
select jsonb_array_length(public.ffr_call_context('F-CTX-1') -> 'visits') as should_be_2,
       jsonb_array_length(public.ffr_call_context('F-CTX-1') -> 'spares') as should_be_1;
reset role;

\echo ''
\echo '--- 2. it is NOT a general call reader: no report, no context ---'
call public.be('vp@x.com');
set role authenticated;
select public.ffr_call_context('F-CTX-2') as should_be_null;
select count(*) as visits_on_that_call_still_hidden from public.reports where ucn = 'F-CTX-2';
reset role;

\echo ''
\echo '--- 3. somebody WITHOUT ffr.view gets nothing from it ---'
call public.be('none@x.com');
set role authenticated;
select public.has_perm('ffr.view') as not_granted,
       public.ffr_call_context('F-CTX-1') as should_be_null;
reset role;

\echo ''
\echo '--- 4. …and the engineer whose call it is loses NOTHING ---'
-- The function returns null for them (no ffr.view), and the application falls
-- back to the tables — which their own policies allow, exactly as before.
call public.be('own@x.com');
set role authenticated;
select public.ffr_call_context('F-CTX-1') as null_so_the_app_falls_back;
select count(*) as own_call_visits_should_be_2 from public.reports where ucn = 'F-CTX-1';
select count(*) as own_call_spares_should_be_1 from public.spare_consumption where ucn = 'F-CTX-1';
reset role;

\echo ''
\echo '--- 5. an unknown UCN, and a blank one, return nothing rather than raising ---'
call public.be('vp@x.com');
set role authenticated;
select public.ffr_call_context('NO-SUCH-UCN') as should_be_null,
       public.ffr_call_context('') as blank_should_be_null,
       public.ffr_call_context(null) as null_should_be_null;
reset role;
