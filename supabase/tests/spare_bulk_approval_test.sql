-- ===========================================================================
-- BULK APPROVAL, AND THE RM QUEUE (0116).
--
-- The user's ask: NSM / Admin / Super Admin tick boxes and approve, at every
-- stage; and a screen of its own listing only what is waiting for an RM.
--
-- What must hold, and what this suite is really for:
--   * a batch advances each line ONE stage — never past a review it has not had;
--   * it SKIPS what the caller may not approve and SAYS SO, rather than failing
--     the batch or approving quietly;
--   * 0033 still stands inside bulk: nobody RM-approves their own request, and
--     a manager stays inside their own tree. Bulk is exactly where that would
--     go unnoticed.
--   * the RM queue lists ONLY lines at RM Approval, and tells each reader which
--     of them are theirs.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('b1b1b1b1-0000-0000-0000-000000000001','ba_nsm@x.com'),
 ('b1b1b1b1-0000-0000-0000-000000000002','ba_rm@x.com'),
 ('b1b1b1b1-0000-0000-0000-000000000003','ba_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('b1b1b1b1-0000-0000-0000-000000000001','ba_nsm@x.com','BA Nsm','nsm'),
 ('b1b1b1b1-0000-0000-0000-000000000002','ba_rm@x.com','BA Rm','rm'),
 ('b1b1b1b1-0000-0000-0000-000000000003','ba_eng@x.com','BA Eng','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- THE DIRECTORY, and this suite exists partly because of it. 0033's rules —
-- never your own request, a manager only within their tree — are answered by
-- `my_dir_name()` and `visible_engineer_names()`, which read `user_directory`
-- and NOT `profiles`. With no directory row a caller has no name to compare
-- against and no reports, so `spare_rm_may_approve` falls through to its
-- permissive branch and the self-approval bar never engages. My first run of
-- this suite proved exactly that, against fixtures that had profiles only.
-- So the directory is seeded, and tests 2 and 3 are what fail if it stops
-- being consulted.
insert into public.user_directory (name, email, reporting_manager, validity) values
 ('BA Nsm', 'ba_nsm@x.com', '',       true),
 ('BA Rm',  'ba_rm@x.com',  'BA Nsm', true),
 ('BA Eng', 'ba_eng@x.com', 'BA Rm',  true)
on conflict do nothing;

-- Two requests: one raised by the engineer, one raised by the NSM themselves.
-- item_status OGP so Commercial and NSM are genuinely required (not auto).
insert into public.spare_requests (uid, or_no, req_type, engineer, engineer_email, item_status, stage)
values ('BA-R1','OR-BA-0001','Call Based','BA Eng','ba_eng@x.com','OGP','RM Approval'),
       ('BA-R2','OR-BA-0002','Call Based','BA Nsm','ba_nsm@x.com','OGP','RM Approval')
on conflict (uid) do nothing;
insert into public.spare_request_lines (request_uid, row_no, part, qty)
values ('BA-R1',1,'P-1|PART ONE',1), ('BA-R1',2,'P-2|PART TWO',1),
       ('BA-R2',1,'P-3|PART THREE',1)
on conflict do nothing;

\echo '--- 1. all three start at RM Approval ---'
\echo 'expect: 3 rows, all RM Approval'
select l.id, r.engineer, l.stage from public.spare_request_lines l
  join public.spare_requests r on r.uid = l.request_uid
 where l.request_uid like 'BA-%' order by l.id;

\echo '--- 2. the RM queue lists exactly those, and says whose they are ---'
\echo 'expect (as the NSM): 3 rows; may_approve TRUE for BA Eng''s two,'
\echo 'FALSE for the NSM''s own — 0033 still stands inside bulk'
call public.be('ba_nsm@x.com');
begin;
  set local role authenticated;
  select engineer, count(*) as lines, bool_and(may_approve) as may_approve
    from public.spare_pending_rm where request_uid like 'BA-%'
   group by engineer order by engineer;
commit;

\echo '--- 3. THE ASK: the NSM ticks all three and approves ---'
\echo 'expect: approved 2, skipped 1, reason mentioning your own request'
call public.be('ba_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.approve_spare_lines(
    array(select id from public.spare_request_lines where request_uid like 'BA-%' order by id), 'BA Nsm');
commit;

\echo '--- 4. ...and each approved line moved exactly ONE stage ---'
\echo 'expect: BA-R1''s two at Commercial (NOT Stores), BA-R2''s still RM Approval'
select l.id, r.engineer, l.stage, l.rm_by from public.spare_request_lines l
  join public.spare_requests r on r.uid = l.request_uid
 where l.request_uid like 'BA-%' order by l.id;

\echo '--- 5. the same batch again advances them to NSM ---'
\echo 'expect: approved 2, skipped 1'
call public.be('ba_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.approve_spare_lines(
    array(select id from public.spare_request_lines where request_uid = 'BA-R1' order by id), 'BA Nsm')
  union all
  select * from public.approve_spare_lines(
    array(select id from public.spare_request_lines where request_uid = 'BA-R2' order by id), 'BA Nsm');
commit;
select l.id, l.stage from public.spare_request_lines l where l.request_uid = 'BA-R1' order by l.id;

\echo '--- 6. and once more, to Stores ---'
\echo 'expect: both at Stores — three presses, three stages, no stage skipped'
call public.be('ba_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.approve_spare_lines(
    array(select id from public.spare_request_lines where request_uid = 'BA-R1' order by id), 'BA Nsm');
commit;
select l.id, l.stage, l.rm_by, l.commercial_by, l.nsm_by
  from public.spare_request_lines l where l.request_uid = 'BA-R1' order by l.id;

\echo '--- 7. approving something already through is SKIPPED, not an error ---'
\echo 'expect: approved 0, skipped 2, reason "already at Stores"'
call public.be('ba_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.approve_spare_lines(
    array(select id from public.spare_request_lines where request_uid = 'BA-R1' order by id), 'BA Nsm');
commit;

\echo '--- 8. an ENGINEER cannot approve at all ---'
\echo 'expect ERROR: your role cannot approve spares'
call public.be('ba_eng@x.com');
begin;
  set local role authenticated;
  select * from public.approve_spare_lines(
    array(select id from public.spare_request_lines where request_uid = 'BA-R2'), 'BA Eng');
commit;

\echo '--- 9. an empty selection is refused rather than reported as 0 done ---'
\echo 'expect ERROR: Nothing selected'
call public.be('ba_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.approve_spare_lines(array[]::bigint[], 'BA Nsm');
commit;

\echo '--- 10. the NSM role really does hold all three approvals now ---'
\echo 'expect: t t t'
select coalesce(permissions,'[]'::jsonb) ? 'spare.approve_rm'         as rm,
       coalesce(permissions,'[]'::jsonb) ? 'spare.approve_commercial' as commercial,
       coalesce(permissions,'[]'::jsonb) ? 'spare.approve_nsm'        as nsm
  from public.app_roles where role = 'nsm';

\echo '--- 11. the RM queue is EMPTY of BA-R1 now, and still holds BA-R2 ---'
\echo 'expect: one row, BA Nsm''s own request, still waiting for somebody above them'
call public.be('ba_nsm@x.com');
begin;
  set local role authenticated;
  select engineer, count(*) from public.spare_pending_rm
   where request_uid like 'BA-%' group by engineer;
commit;

\echo '--- 12. cleanup ---'
call public.be(null);
delete from public.spare_request_lines where request_uid like 'BA-%';
delete from public.spare_requests where uid like 'BA-%';
delete from public.profiles where email like 'ba_%@x.com';
delete from public.user_directory where email like 'ba_%@x.com';
