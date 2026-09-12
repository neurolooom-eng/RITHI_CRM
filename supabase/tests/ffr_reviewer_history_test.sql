-- ===========================================================================
-- WHO REVIEWED IT (0173) and EVERY CHANGE TO THE REPORT (0174).
--
--   The reviewer is recorded BY THE DATABASE at the moment a review is
--   completed, so the auto-save and bulk paths — which send no name — record a
--   person rather than nothing. A name the client DID send is kept, because it
--   is what the reviewer saw on screen.
--   Editing the review weeks later does NOT reassign it: the person who
--   answered it is the reviewer, not whoever corrected a spelling in March.
--   The FFR carries that name, and never the string 'Daily Call Review' — a
--   screen is not a person.
--   Every UPDATE to a report writes ONE history row holding only the columns
--   that actually differ; an update that changes nothing writes nothing;
--   updated_at is never an entry on its own; and the history cannot be altered
--   or deleted through the API.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run ONCE after _stub.sql + every migration (it seeds rows; a second run on
-- the same database will duplicate-key).
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('77700000-0000-0000-0000-000000000001','rv_admin@x.com'),
 ('77700000-0000-0000-0000-000000000002','rv_bag@x.com'),
 ('77700000-0000-0000-0000-000000000003','rv_other@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('77700000-0000-0000-0000-000000000001','rv_admin@x.com','RV Admin','admin'),
 ('77700000-0000-0000-0000-000000000002','rv_bag@x.com','bagyaraj lowercase typo','admin'),
 ('77700000-0000-0000-0000-000000000003','rv_other@x.com','RV Other','admin')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

-- USER MASTER holds the AUTHORITATIVE spelling, and it is deliberately NOT the
-- same as the profile's above: the whole point of "match in user master for
-- exact name" is that the master wins.
insert into public.user_directory (name, email) values
 ('Bagyaraj M', 'rv_bag@x.com'),
 ('RV Other',   'rv_other@x.com')
on conflict do nothing;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo ''
\echo '--- 1. AUTO-SAVE sends no name, and the database records the person ---'
call public.be('rv_other@x.com');
set role authenticated;
-- Exactly what an auto-save writes: the three answers, and nothing else.
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure)
values ('F-REV-1', 'CN1', 'NO', 'NO', 'NO');
select review2_done as should_be_true,
       review2_by   as should_be_RV_Other,
       (review2_by_uid = '77700000-0000-0000-0000-000000000003') as uid_is_the_session
  from public.call_reviews where ucn = 'F-REV-1';
reset role;

\echo ''
\echo '--- 2. a name the CLIENT sent is kept (it is what the reviewer saw) ---'
call public.be('rv_other@x.com');
set role authenticated;
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, review2_by)
values ('F-REV-2', 'CN2', 'NO', 'NO', 'NO', 'Typed On Screen');
select review2_by as should_be_Typed_On_Screen from public.call_reviews where ucn = 'F-REV-2';
reset role;

\echo ''
\echo '--- 3. a LATER edit does not reassign the review ---'
call public.be('rv_admin@x.com');
set role authenticated;
update public.call_reviews set complaint_grouping = 'corrected a typo' where ucn = 'F-REV-1';
select review2_by as should_still_be_RV_Other,
       (review2_by_uid = '77700000-0000-0000-0000-000000000003') as uid_unchanged
  from public.call_reviews where ucn = 'F-REV-1';
reset role;

\echo ''
\echo '--- 4. the FFR carries the reviewer, never "Daily Call Review" ---'
call public.be('rv_other@x.com');
set role authenticated;
-- YES on any of the three raises the report (0167), through raise_ffr (0169).
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure)
values ('F-REV-3', 'CN3', 'YES', 'NO', 'NO');
select ffr_no, raised_by_name as should_be_RV_Other
  from public.field_failure_reports where ucn = 'F-REV-3';
select count(*) as reports_naming_the_screen
  from public.field_failure_reports where raised_by_name = 'Daily Call Review';
reset role;

\echo ''
\echo '--- 5. REVIEW 3''s reviewer is preferred where there is one ---'
call public.be('rv_admin@x.com');
set role authenticated;
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure,
                                 complaint_grouping, root_cause_keyword, spare_category, service_observation)
values ('F-REV-4', 'CN4', 'YES', 'NO', 'NO', 'G', 'RC', 'SPARE', 'obs');
select review3_by as should_be_RV_Admin from public.call_reviews where ucn = 'F-REV-4';
select raised_by_name as should_be_RV_Admin from public.field_failure_reports where ucn = 'F-REV-4';
reset role;

-- ===========================================================================
-- THE BACK-FILL TO BAGYARAJ — the name comes from USER MASTER, verbatim.
-- ===========================================================================
\echo ''
\echo '--- 6. old records with no reviewer take the MASTER''s spelling ---'
-- A report from before any of this, with nobody named.
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported, raised_by_name)
values ('FFR - 900/25', 'PC', 'F-OLD-1', date '2025-06-01', 'Old Hospital', 'old problem', '');
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported, raised_by_name)
values ('FFR - 901/25', 'PC', 'F-OLD-2', date '2025-06-02', 'Old Hospital', 'old problem', 'Daily Call Review');

do $$
declare v_name text;
begin
  select d.name into v_name from public.user_directory d
   where lower(btrim(d.name)) like 'bagyaraj%' order by length(d.name) limit 1;
  update public.field_failure_reports set raised_by_name = v_name
   where coalesce(btrim(raised_by_name), '') in ('', 'Daily Call Review');
end $$;

-- "Bagyaraj M", the master's spelling — NOT the profile's
-- "bagyaraj lowercase typo", which is what a hand-typed name would have given.
select ffr_no, raised_by_name as should_be_Bagyaraj_M
  from public.field_failure_reports where ucn like 'F-OLD-%' order by ffr_no;
-- …and a report that already named somebody is untouched.
select raised_by_name as should_still_be_RV_Other
  from public.field_failure_reports where ucn = 'F-REV-3';

-- ===========================================================================
-- THE UPDATE LOG.
-- ===========================================================================
\echo ''
\echo '--- 7. every report has a history that starts at its creation ---'
select count(*) as create_entries from public.ffr_history where action = 'create';
select count(*) as reports from public.field_failure_reports;

\echo ''
\echo '--- 8. an update writes ONE row holding only what changed ---'
call public.be('rv_admin@x.com');
set role authenticated;
update public.field_failure_reports
   set problem_status = 'Under investigation', capa_status = 'Open'
 where ucn = 'F-REV-3';
reset role;
select changed_by_name as should_be_RV_Admin,
       action,
       (select count(*) from jsonb_object_keys(changes)) as fields_changed,
       changes ? 'problem_status' as has_problem_status,
       changes ? 'capa_status'    as has_capa_status,
       changes ? 'updated_at'     as should_be_false_updated_at,
       changes -> 'capa_status' ->> 'from' as capa_from,
       changes -> 'capa_status' ->> 'to'   as capa_to
  from public.ffr_history
 where ffr_no = (select ffr_no from public.field_failure_reports where ucn = 'F-REV-3')
   and action = 'update';

\echo ''
\echo '--- 9. an update that changes NOTHING writes nothing ---'
call public.be('rv_admin@x.com');
set role authenticated;
update public.field_failure_reports set problem_status = 'Under investigation' where ucn = 'F-REV-3';
reset role;
select count(*) as should_still_be_1 from public.ffr_history
 where ffr_no = (select ffr_no from public.field_failure_reports where ucn = 'F-REV-3')
   and action = 'update';

\echo ''
\echo '--- 10. the history is APPEND-ONLY, and NOT by raising an error ---'
-- There is no update policy and no delete policy, so RLS matches no row and
-- both statements report affecting nothing. That is why this asserts the ROWS
-- ARE UNCHANGED rather than "an error was raised": a test that only looked for
-- an exception would pass against a table anyone could rewrite.
-- The retention guard (0166's block_hard_delete) sits behind this for the paths
-- RLS does not cover — a definer function, a direct connection.
call public.be('rv_admin@x.com');
set role authenticated;
update public.ffr_history set changed_by_name = 'somebody else' where action = 'update';
select count(*) as rows_an_admin_could_rewrite
  from public.ffr_history where changed_by_name = 'somebody else';
delete from public.ffr_history where action = 'update';
reset role;
select count(*) as history_rows_still_there from public.ffr_history where action = 'update';

\echo ''
\echo '--- 11. an ENGINEER cannot read the history at all ---'
insert into auth.users (id,email) values ('77700000-0000-0000-0000-000000000004','rv_eng@x.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('77700000-0000-0000-0000-000000000004','rv_eng@x.com','RV Engineer','engineer')
on conflict (id) do update set role = excluded.role;
call public.be('rv_eng@x.com');
set role authenticated;
select count(*) as should_be_0 from public.ffr_history;
reset role;
