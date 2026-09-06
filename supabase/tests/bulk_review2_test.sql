-- ===========================================================================
-- BULK REVIEW 2, AND THE ONE IT MUST REFUSE (0119).
--
-- The user's rule: "If the Age at failure is less than 366, then it has to be
-- done 1 by 1. If it is not, then it can be bulk set."
--
-- That rule IS the function. Review 2 asks whether a failure was a WARRANTY
-- FAILURE (1 yr), so a machine that failed inside its first year is exactly
-- the case the question exists for and exactly the one nobody should answer
-- forty at a time. This suite is what stops that guard being lost.
--
-- Enforced in the DATABASE, not only by hiding a checkbox: a hidden box is a
-- convenience, and this is a quality record.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('e1e1e1e1-0000-0000-0000-000000000001','br_rev@x.com'),
 ('e1e1e1e1-0000-0000-0000-000000000002','br_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('e1e1e1e1-0000-0000-0000-000000000001','br_rev@x.com','BR Reviewer','hotline'),
 ('e1e1e1e1-0000-0000-0000-000000000002','br_eng@x.com','BR Engineer','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Ages are set through warranty_start against a fixed complaint date, exactly
-- as `field_call_review` computes them.
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, complaint_date,
                                warranty_start, party_name, complaint_reported, standard_complaint, allocated_to)
values
 ('BR-OLD1','FIELD','VEGA','1', date '2026-09-01', date '2026-09-01', date '2020-01-01','H','x','y','E'),
 ('BR-OLD2','FIELD','VEGA','2', date '2026-09-01', date '2026-09-01', date '2019-01-01','H','x','y','E'),
 -- 365 days: INSIDE the first year, by one day. The boundary case.
 ('BR-365', 'FIELD','VEGA','3', date '2026-09-01', date '2026-09-01', date '2025-09-01','H','x','y','E'),
 -- 366 days: outside it, by one day.
 ('BR-366', 'FIELD','VEGA','4', date '2026-09-01', date '2026-09-01', date '2025-08-31','H','x','y','E'),
 -- no warranty start at all -> no age
 ('BR-NOAGE','FIELD','VEGA','5', date '2026-09-01', date '2026-09-01', null,'H','x','y','E'),
 -- already answered
 ('BR-DONE','FIELD','VEGA','6', date '2026-09-01', date '2026-09-01', date '2018-01-01','H','x','y','E')
on conflict (ucn) do nothing;
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, review2_by)
values ('BR-DONE','', 'YES','NO','NO','Somebody Earlier')
on conflict (ucn) do nothing;

\echo '--- 1. the ages the register computes ---'
\echo 'expect: OLD1 2435, OLD2 2800, BR-365 365, BR-366 366, NOAGE empty'
select ucn, (coalesce(complaint_date, reg_date) - warranty_start) as age_days
  from public.field_calls where ucn like 'BR-%' order by ucn;

\echo '--- 2. THE RULE: everything under 366 days is refused, the rest is set ---'
\echo 'expect: updated 3 (OLD1, OLD2, BR-366); skipped 3 with three DIFFERENT'
\echo 'reasons — inside the first year, age not known, already answered'
call public.be('br_rev@x.com');
begin;
  set local role authenticated;
  select * from public.bulk_set_review2(
    array['BR-OLD1','BR-OLD2','BR-365','BR-366','BR-NOAGE','BR-DONE'], 'NO','NO','NO','BR Reviewer');
commit;

\echo '--- 3. ...and this is what it wrote ---'
\echo 'expect: OLD1, OLD2 and BR-366 answered NO/NO/NO by BR Reviewer and DONE;'
\echo 'BR-365 and BR-NOAGE untouched; BR-DONE still says YES from before'
select r.ucn, r.risk_to_patient, r.warranty_failure, r.frequent_failure,
       r.review2_by, r.review2_done, r.any_potential_effect
  from public.call_reviews r where r.ucn like 'BR-%' order by r.ucn;

\echo '--- 4. the 365-day call is still there to be done one by one ---'
\echo 'expect: 0 rows — nothing was written for it'
select count(*) as rows_for_365 from public.call_reviews where ucn = 'BR-365';

\echo '--- 5. a partial answer is refused: Review 2 is three answers or none ---'
\echo 'expect ERROR: Review 2 needs all three answers'
call public.be('br_rev@x.com');
begin;
  set local role authenticated;
  select * from public.bulk_set_review2(array['BR-OLD1'], 'NO','', 'NO','BR Reviewer');
commit;

\echo '--- 6. an empty selection is refused rather than reported as 0 done ---'
\echo 'expect ERROR: Nothing selected'
call public.be('br_rev@x.com');
begin;
  set local role authenticated;
  select * from public.bulk_set_review2(array[]::text[], 'NO','NO','NO','BR Reviewer');
commit;

\echo '--- 7. an engineer cannot do it at all ---'
\echo 'expect ERROR: cannot complete the daily call review'
call public.be('br_eng@x.com');
begin;
  set local role authenticated;
  select * from public.bulk_set_review2(array['BR-OLD1'], 'NO','NO','NO','BR Engineer');
commit;

\echo '--- 8. a UCN that does not exist is skipped, not an error ---'
\echo 'expect: updated 0, skipped 1, reason "no such call"'
call public.be('br_rev@x.com');
begin;
  set local role authenticated;
  select * from public.bulk_set_review2(array['BR-NOPE'], 'NO','NO','NO','BR Reviewer');
commit;

\echo '--- 9. cleanup ---'
call public.be(null);
delete from public.call_reviews where ucn like 'BR-%';
delete from public.field_calls where ucn like 'BR-%';
delete from public.profiles where email like 'br_%@x.com';
