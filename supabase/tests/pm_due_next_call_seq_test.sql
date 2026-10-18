-- ===========================================================================
-- A PM CALL MADE FROM PM DUE CONTINUES ITS MONTH'S NUMBERING (0447).
--
-- The user, 2026-10-18: "Say there are 400 calls already in the list for that
-- month, then the call number should be 26PMOCT401-J-Prod-serialno" (padded to
-- 4, like every existing one). pm_due_next_call_seq() is one more than the
-- largest running number the month's PM calls carry, never less than the
-- month's count + 1, whoever's calls they are.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('e1e1e447-0000-0000-0000-000000000001', 'pmseq_gen@x.com'),
 ('e1e1e447-0000-0000-0000-000000000002', 'pmseq_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, designation, extra_permissions) values
 ('e1e1e447-0000-0000-0000-000000000001', 'pmseq_gen@x.com', 'PM GEN', 'engineer', '', '["pm.generate"]'),
 ('e1e1e447-0000-0000-0000-000000000002', 'pmseq_eng@x.com', 'PM ENG', 'engineer', '', '["mod:/pm-due"]')
on conflict (id) do update set role = excluded.role, extra_permissions = excluded.extra_permissions;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- October 2026: three calls numbered 0001-0003, one of them CANCELLED -- it
-- keeps its number. November: a call carrying a GAP (0007) and one with a
-- number in another shape. September: none. All allotted to somebody the
-- caller cannot see, so the answer must not depend on row-level security.
insert into public.pm_calls (ucn, call_number, call_type, reg_date, reg_at, product_name, serial, party_name, complaint_reported, allocated_to, created_by, cancelled_at, cancel_reason) values
 ('PS-1', '26PMOCT0001-J-ORION-G-1', 'P M VISIT', '2026-10-01', '2026-10-01 00:30:00+05:30', 'ORION-G', '1', 'PS', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null, null, ''),
 ('PS-2', '26PMOCT0002-J-VEGA-2',    'P M VISIT', '2026-10-01', '2026-10-01 00:30:05+05:30', 'VEGA',    '2', 'PS', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null, now(), 'test'),
 ('PS-3', '26PMOCT0003-J-VEGA-3',    'P M VISIT', '2026-10-01', '2026-10-01 00:30:10+05:30', 'VEGA',    '3', 'PS', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null, null, ''),
 ('PS-4', '26PMNOV0007-K-VEGA-4',    'P M VISIT', '2026-11-01', '2026-11-01 00:30:00+05:30', 'VEGA',    '4', 'PS', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null, null, ''),
 ('PS-5', 'CL2600099',               'P M VISIT', '2026-11-01', '2026-11-01 00:30:05+05:30', 'VEGA',    '5', 'PS', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null, null, ''),
 -- December: two calls in another shape only -- the count decides.
 ('PS-6', 'CL2600100',               'P M VISIT', '2026-12-01', '2026-12-01 00:30:00+05:30', 'VEGA',    '6', 'PS', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null, null, ''),
 ('PS-7', 'CL2600101',               'P M VISIT', '2026-12-01', '2026-12-01 00:30:05+05:30', 'VEGA',    '7', 'PS', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null, null, ''),
 -- A NOVEMBER number filed in October would be another month's: not counted as October's.
 ('PS-8', '26PMNOV0050-K-VEGA-8',    'P M VISIT', '2026-10-01', '2026-10-01 00:30:15+05:30', 'VEGA',    '8', 'PS', 'SCHEDULED PM VISIT', 'SOMEBODY ELSE', null, null, '');

\echo
\echo '--- 1. the next running number, by the month''s own numbers ---'
call public.be('pmseq_gen@x.com');
set role authenticated;
select public.pm_due_next_call_seq('2026-10-01') = 5
       as "October: 0001-0003 used (one cancelled, still counted) and 4 calls -> 5";
select public.pm_due_next_call_seq('2026-11-20') = 8 as "November: the largest is 0007, so 0008 -- never a number already taken";
select public.pm_due_next_call_seq('2026-12-01') = 3 as "December: no number in the shape, 2 calls -> 3";
select public.pm_due_next_call_seq('2026-09-01') = 1 as "a month with no PM call starts at 1";
reset role;

\echo
\echo '--- 2. nobody without pm.generate may ask, and the public key cannot call it ---'
call public.be('pmseq_eng@x.com');
set role authenticated;
\echo '    expect ERROR below -- needs pm.generate'
select public.pm_due_next_call_seq('2026-10-01');
reset role;
select not has_function_privilege('anon', 'public.pm_due_next_call_seq(date)', 'execute') as "anon cannot execute it";
