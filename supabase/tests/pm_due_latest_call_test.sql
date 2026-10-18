-- ===========================================================================
-- PM DUE NAMES THE MONTH'S LATEST PM CALL (0446).
--
-- The user, 2026-10-18: "when creating tell me what is the last call in oct
-- with Date and time and also what will be first call that we create will get
-- in terms of Date and time". pm_due_latest_call() returns the call holding
-- the largest registration date-and-time in the month -- the call
-- pm_due_latest_reg_at() (0401) takes its time from -- whoever's call it is.
--
-- Superuser bypasses RLS, so the reads that matter run as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('e1e1e446-0000-0000-0000-000000000001', 'pmlast_gen@x.com'),
 ('e1e1e446-0000-0000-0000-000000000002', 'pmlast_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, designation, extra_permissions) values
 ('e1e1e446-0000-0000-0000-000000000001', 'pmlast_gen@x.com', 'PM GEN', 'engineer', '', '["pm.generate"]'),
 ('e1e1e446-0000-0000-0000-000000000002', 'pmlast_eng@x.com', 'PM ENG', 'engineer', '', '["mod:/pm-due"]')
on conflict (id) do update set role = excluded.role, extra_permissions = excluded.extra_permissions;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- October: three calls, allotted to somebody the caller cannot see, so RLS
-- hides them from the caller -- the answer must not depend on that. The latest
-- is PL-3; PL-4 is dated November and registered later still, so it is not
-- October's.
insert into public.pm_calls (ucn, call_number, call_type, reg_date, reg_at, product_name, serial, party_name, complaint_reported, allocated_to, created_by) values
 ('PL-1', 'PL1', 'P M VISIT', '2026-10-01', '2026-10-01 00:30:00+05:30', 'ORION-G', 'PL-S1', 'PL HOSPITAL', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null),
 ('PL-3', 'PL3', 'P M VISIT', '2026-10-01', '2026-10-18 10:15:30+05:30', 'VEGA',    'PL-S3', 'PL CLINIC',   'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null),
 ('PL-2', 'PL2', 'P M VISIT', '2026-10-01', '2026-10-01 00:30:10+05:30', 'ORION-G', 'PL-S2', 'PL HOSPITAL', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null),
 ('PL-4', 'PL4', 'P M VISIT', '2026-11-01', '2026-11-02 09:00:00+05:30', 'ORION-G', 'PL-S4', 'PL HOSPITAL', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null);

\echo
\echo '--- 1. the month''s latest call, by registration time, whoever''s it is ---'
call public.be('pmlast_gen@x.com');
set role authenticated;
select (select ucn from public.pm_due_latest_call('2026-10-01')) = 'PL-3' as "October's latest is PL-3";
select (select call_number || ' ' || party_name || ' ' || product_name || ' ' || serial from public.pm_due_latest_call('2026-10-15'))
       = 'PL3 PL CLINIC VEGA PL-S3' as "with its call number, party, product and serial, from any day in the month";
select (select reg_at from public.pm_due_latest_call('2026-10-01')) = public.pm_due_latest_reg_at('2026-10-01')
       as "its time is exactly the time the batch follows (0401)";
select (select ucn from public.pm_due_latest_call('2026-11-01')) = 'PL-4' as "November's is PL-4, not October's";
select not exists (select 1 from public.pm_due_latest_call('2027-01-01')) as "an empty month has none";
reset role;

\echo
\echo '--- 2. nobody without pm.generate may ask, and the public key cannot call it ---'
call public.be('pmlast_eng@x.com');
set role authenticated;
\echo '    expect ERROR below -- needs pm.generate'
select * from public.pm_due_latest_call('2026-10-01');
reset role;
select not has_function_privilege('anon', 'public.pm_due_latest_call(date)', 'execute') as "anon cannot execute it";
