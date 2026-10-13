-- ===========================================================================
-- CALL HISTORY IS KEPT APART (0429).
--
--   1. An administrator loads two historical calls sharing a UC Number with
--      different Call Nos: both are kept, as written -- status, solved date,
--      Item Status -- and re-loading one corrects it, not duplicates it.
--   2. NOTHING FOLLOWS: no call in any register, no visit, no review, no FFR,
--      no notification.
--   3. An engineer reads only the history of their own calls (and the
--      unallotted); a role without bulk.upload cannot write it; nobody signed in
--      can delete it; the public key reads nothing.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e429000-0000-0000-0000-000000000001', 'chx_admin@x.com'),
  ('0e429000-0000-0000-0000-000000000002', 'chx_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e429000-0000-0000-0000-000000000001', 'chx_admin@x.com', 'CHX Admin', 'admin'),
  ('0e429000-0000-0000-0000-000000000002', 'chx_eng@x.com',   'CHX Eng',   'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated, anon;
delete from public.user_directory where email in ('chx_eng@x.com');
insert into public.user_directory (name, email, reporting_manager) values ('CHX Eng', 'chx_eng@x.com', '');

\echo '--- 1. two calls under one UC Number, kept as written ---'
call public.be('chx_admin@x.com');
set role authenticated;
insert into public.call_history (ucn, call_no, call_at, call_type, party_name, engineer, item_name, serial, item_status, call_status, solved_at) values
  ('CHX21E28014', '50549', timestamptz '2021-05-28 12:16+05:30', 'P M VISIT', 'THQH', 'CHX Eng',   'MONNAL T60', 'CHX7661', 'Under Contract', 'Solved',   timestamptz '2021-05-28 15:00+05:30'),
  ('CHX21E28014', '64580', timestamptz '2021-12-08 20:30+05:30', 'FIELD',     'THQH', 'CHX Other', 'MONNAL T60', 'CHX7661', 'Under Contract', 'Unsolved', null),
  ('CHX19A00001', '1001',  timestamptz '2019-01-02 10:00+05:30', 'FIELD',     'P',    '',          'VEGA',       'CHX1',    'Under Warranty', 'Solved',   timestamptz '2019-01-03 10:00+05:30');
select 'both calls of the shared UC Number are kept' as t, count(*) = 2 as ok from public.call_history where ucn = 'CHX21E28014';
select 'the file''s words are kept: Under Contract, Unsolved, no solved date' as t,
  item_status = 'Under Contract' and call_status = 'Unsolved' and solved_at is null as ok
  from public.call_history where ucn = 'CHX21E28014' and call_no = '64580';
insert into public.call_history (ucn, call_no, call_status, item_name, serial)
values ('CHX21E28014', '64580', 'Solved', 'MONNAL T60', 'CHX7661')
on conflict (ucn, call_no) do update set call_status = excluded.call_status;
select 're-loading corrects the call rather than adding it' as t,
  (select count(*) from public.call_history where ucn = 'CHX21E28014') = 2
  and (select call_status from public.call_history where call_no = '64580') = 'Solved' as ok;
reset role;

\echo '--- 2. nothing follows from a row ---'
select 'no call is filed in any register' as t, not exists (select 1 from public.calls where ucn like 'CHX%') as ok;
select 'no visit is filed' as t, not exists (select 1 from public.reports where ucn like 'CHX%') as ok;
select 'no review is filed' as t, not exists (select 1 from public.call_reviews where ucn like 'CHX%') as ok;
select 'no Field Failure Report is raised' as t, not exists (select 1 from public.field_failure_reports where ucn like 'CHX%') as ok;
select 'nobody is notified' as t, not exists (select 1 from public.notifications where body like '%CHX%') as ok;

\echo '--- 3. who reads and writes it ---'
call public.be('chx_eng@x.com');
set role authenticated;
select 'the engineer reads their own call and the unallotted one, not somebody else''s' as t,
  (select string_agg(call_no, ',' order by call_no) from public.call_history where ucn like 'CHX%') = '1001,50549' as ok;
\echo 'expect ERROR: new row violates row-level security policy for table "call_history"'
insert into public.call_history (ucn, call_no) values ('CHX-NEW', '1');
\echo 'expect ERROR: permission denied for table call_history'
delete from public.call_history where ucn like 'CHX%';
reset role;
update public.harness set uid = null, email = null;
set role anon;
\echo 'expect ERROR: permission denied for table call_history'
select count(*) from public.call_history;
reset role;

delete from public.call_history where ucn like 'CHX%';
