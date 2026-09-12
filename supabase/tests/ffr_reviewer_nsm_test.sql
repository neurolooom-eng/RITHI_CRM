-- ===========================================================================
-- FINDING THE REVIEWER BY NAME **AND** ROLE (0175).
--
--   "Bagyaraj would be mapped as nsm" — so the role is the second key, and a
--   much stronger one than a spelling: the master may hold "M Bagyaraj",
--   "Bagyaraj M" or "BAGYARAJ.M", none of which a prefix match finds.
--   IT REFUSES TO GUESS. Two people matching, or the keys disagreeing, changes
--   NOTHING — a quality record naming the wrong person is worse than one
--   naming nobody.
--   It FILLS SILENCE ONLY: a record that already names somebody is never
--   reassigned, on any run.
--   And it is RE-RUNNABLE after he is added to User Master, without re-running
--   a bundle.
--
-- Superuser bypasses RLS; this runs on a direct connection, which is where the
-- function is actually used (the SQL editor).
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- The harness up front: test 7 EDITS User Master, and its write guard
-- (0030/0033) refuses anybody who is not an administrator — on a direct
-- connection auth.uid() is NULL, so it refuses there too.
insert into auth.users (id,email) values
 ('88800000-0000-0000-0000-000000000009','nsm_admin@x.com'),
 ('88800000-0000-0000-0000-000000000001','nsm_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('88800000-0000-0000-0000-000000000009','nsm_admin@x.com','NSM Admin','admin'),
 ('88800000-0000-0000-0000-000000000001','nsm_eng@x.com','NSM Engineer','engineer')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
call public.be('nsm_admin@x.com');

-- Reports naming nobody, and one that already names a person.
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported, raised_by_name)
values ('FFR - 800/25','PC','N-1', date '2025-05-01','H','p',''),
       ('FFR - 801/25','PC','N-2', date '2025-05-02','H','p','Daily Call Review'),
       ('FFR - 802/25','PC','N-3', date '2025-05-03','H','p','Someone Real');

\echo ''
\echo '--- 1. NOBODY on User Master: it changes nothing and says why ---'
select name_used, matched_on, note from public.ffr_reviewer_backfill(p_apply => true);
select ffr_no, raised_by_name from public.field_failure_reports where ucn like 'N-%' order by ffr_no;

\echo ''
\echo '--- 2. a spelling a PREFIX match would MISS, with the nsm role ---'
insert into public.user_directory (name, email, role) values ('M Bagyaraj', 'bag@x.com', 'nsm');
-- Dry run first: it reports and changes nothing.
select name_used, matched_on, ffr_rows, note from public.ffr_reviewer_backfill();
select ffr_no, raised_by_name as unchanged_by_the_dry_run
  from public.field_failure_reports where ucn = 'N-1';

\echo ''
\echo '--- 3. …and applying it uses the MASTER''s spelling verbatim ---'
select name_used, matched_on, ffr_rows, note from public.ffr_reviewer_backfill(p_apply => true);
select ffr_no, raised_by_name from public.field_failure_reports where ucn like 'N-%' order by ffr_no;

\echo ''
\echo '--- 4. a second run changes nothing (there is nothing left naming nobody) ---'
select ffr_rows as should_be_0, note from public.ffr_reviewer_backfill(p_apply => true);

\echo ''
\echo '--- 5. TWO people matching name and role: it refuses rather than picking ---'
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported, raised_by_name)
values ('FFR - 803/25','PC','N-4', date '2025-05-04','H','p','');
insert into public.user_directory (name, email, role) values ('Bagyaraj Kumar', 'bag2@x.com', 'nsm');
select name_used as should_be_empty, matched_on, note from public.ffr_reviewer_backfill(p_apply => true);
select raised_by_name as should_still_be_empty from public.field_failure_reports where ucn = 'N-4';

\echo ''
\echo '--- 6. the role alone finds him when the NAME does not match at all ---'
delete from public.user_directory where email in ('bag@x.com','bag2@x.com');
insert into public.user_directory (name, email, role) values ('B. Raj', 'braj@x.com', 'nsm');
select name_used as should_be_B_Raj, matched_on, note from public.ffr_reviewer_backfill(p_apply => true);
select raised_by_name as should_be_B_Raj from public.field_failure_reports where ucn = 'N-4';

\echo ''
\echo '--- 7. an INVALID (left) master row is never chosen ---'
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported, raised_by_name)
values ('FFR - 804/25','PC','N-5', date '2025-05-05','H','p','');
-- As the administrator seeded above; the directory's write guard refuses
-- anybody else, which is what made the first version of this test print an
-- unlabelled error.
update public.user_directory set validity = false where email = 'braj@x.com';
select name_used as should_be_empty, note from public.ffr_reviewer_backfill(p_apply => true);
select raised_by_name as should_still_be_empty from public.field_failure_reports where ucn = 'N-5';

\echo ''
\echo '--- 8. a signed-in NON-administrator is refused (expect ERROR) ---'
call public.be('nsm_eng@x.com');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"88800000-0000-0000-0000-000000000001"}', false);
select * from public.ffr_reviewer_backfill(p_apply => true);
reset role;
select set_config('request.jwt.claims', '', false);
