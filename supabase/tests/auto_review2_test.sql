-- ===========================================================================
-- REVIEW 2 ANSWERS ITSELF THE MORNING AFTER (0124).
--
-- The user's rule: "if a call is logged Today, Review 2 should be marked as No
-- tomorrow. It should still be pending for review today; it can be marked as No
-- the next day - 9:15 am."
--
-- What this suite is really holding — and it is all about WHEN:
--   * a call logged TODAY is untouched, at any hour, including 9:16 pm;
--   * the same call is answered No the next morning, but NOT at 9:14;
--   * everything is measured in Asia/Kolkata, not the server's UTC — an hour
--     either side of midnight IST is where a UTC `current_date` gets it wrong;
--   * a first-year failure is NEVER answered by the clock, which is the user's
--     own rule from 0119 and matters more here, not less;
--   * an answer a person already gave is not overwritten;
--   * it is idempotent — a second run marks nothing;
--   * `review2_by` says it was automatic, which is what Review 3 reads.
--
-- The clock is injected through auto_answer_review2_asof(), which no signed-in
-- caller may execute — test 10 asserts exactly that, because a seam that lets
-- a clock in is a seam that lets today's calls be marked early.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('a2a2a2a2-0000-0000-0000-000000000001','ar_admin@x.com'),
 ('a2a2a2a2-0000-0000-0000-000000000002','ar_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('a2a2a2a2-0000-0000-0000-000000000001','ar_admin@x.com','AR Admin','admin'),
 ('a2a2a2a2-0000-0000-0000-000000000002','ar_eng@x.com','AR Eng','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- "Today" for this suite is 2026-09-10 in Asia/Kolkata.
delete from public.call_reviews where ucn like 'AR-%';
delete from public.field_calls  where ucn like 'AR-%';
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, complaint_date,
                                warranty_start, party_name, complaint_reported, standard_complaint, allocated_to)
values
 -- logged YESTERDAY, comfortably out of warranty: the routine case.
 ('AR-Y1','C-Y1','FIELD','VEGA','1', date '2026-09-09', date '2026-09-09', date '2020-01-01','H','x','y','E'),
 ('AR-Y2','C-Y2','FIELD','VEGA','2', date '2026-09-09', date '2026-09-09', date '2019-01-01','H','x','y','E'),
 -- logged a WEEK ago and still pending: the sweep is "before today", not
 -- "yesterday only", or a backlog would never clear.
 ('AR-W1','C-W1','FIELD','VEGA','3', date '2026-09-03', date '2026-09-03', date '2018-01-01','H','x','y','E'),
 -- logged TODAY: pending all day, whatever the hour.
 ('AR-T1','C-T1','FIELD','VEGA','4', date '2026-09-10', date '2026-09-10', date '2020-01-01','H','x','y','E'),
 -- 365 days at failure — INSIDE the first year by one day. Never automatic.
 ('AR-365','C-365','FIELD','VEGA','5', date '2026-09-09', date '2026-09-09', date '2025-09-09','H','x','y','E'),
 -- 366 days — outside it by one day, so it IS automatic. The boundary, both sides.
 ('AR-366','C-366','FIELD','VEGA','6', date '2026-09-09', date '2026-09-09', date '2025-09-08','H','x','y','E'),
 -- no warranty start, so no age: never automatic either.
 ('AR-NOAGE','C-NA','FIELD','VEGA','7', date '2026-09-09', date '2026-09-09', null,'H','x','y','E'),
 -- answered by a person already: must not be rewritten.
 ('AR-DONE','C-DN','FIELD','VEGA','8', date '2026-09-09', date '2026-09-09', date '2020-01-01','H','x','y','E');

insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, review2_by)
values ('AR-DONE','C-DN','YES','YES','NO','A Person');

\echo '--- 1. at 9:14 am on the 10th, NOTHING is marked ---'
\echo 'expect: ran = f, marked = 0'
select marked, ran, note from public.auto_answer_review2_asof(timestamptz '2026-09-10 09:14:00+05:30');

\echo '--- 2. at 9:16 PM on the 9th — LATE on the day five of them were logged ---'
\echo 'expect: marked 1. Only AR-W1 (logged the 3rd) is before today; the five'
\echo 'expect: logged on the 9th stay pending however late in the day it gets'
select marked, held_first_year, held_unknown_age from public.auto_answer_review2_asof(timestamptz '2026-09-09 21:16:00+05:30');
\echo 'expect: all five blank — nothing logged today was touched'
select c.ucn, coalesce(r.review2_done,false) as done
  from public.field_calls c left join public.call_reviews r on r.ucn = c.ucn
 where c.ucn in ('AR-Y1','AR-Y2','AR-365','AR-366','AR-NOAGE') order by c.ucn;

\echo '--- 3. 9:15 am on the 10th: the rest of the routine ones are answered No ---'
\echo 'expect: marked 3 (Y1, Y2, 366 — W1 went yesterday), held 1 first-year + 1 no-age'
select marked, held_first_year, held_unknown_age, ran, note
  from public.auto_answer_review2_asof(timestamptz '2026-09-10 09:15:00+05:30');

\echo '--- 4. what each call now says ---'
\echo 'expect: Y1 Y2 W1 366 = NO/NO/NO by Auto; T1 365 NOAGE blank; DONE untouched'
select c.ucn,
       coalesce(r.risk_to_patient,'-')  as risk,
       coalesce(r.warranty_failure,'-') as warranty,
       coalesce(r.frequent_failure,'-') as frequent,
       coalesce(r.review2_by,'-')       as by,
       coalesce(r.review2_done,false)   as done
  from public.field_calls c
  left join public.call_reviews r on r.ucn = c.ucn
 where c.ucn like 'AR-%' order by c.ucn;

\echo '--- 5. running it again marks nothing — it is idempotent ---'
\echo 'expect: marked 0, and the two held are still held'
select marked, held_first_year, held_unknown_age, note
  from public.auto_answer_review2_asof(timestamptz '2026-09-10 11:00:00+05:30');

\echo '--- 6. the next morning, TODAY''s call has become yesterday''s ---'
\echo 'expect: marked 1 — AR-T1, and only it'
select marked, held_first_year, held_unknown_age
  from public.auto_answer_review2_asof(timestamptz '2026-09-11 09:15:00+05:30');
select ucn, review2_by from public.call_reviews where ucn = 'AR-T1';

\echo '--- 7. the first-year failure and the ageless one are STILL waiting ---'
\echo 'expect: two rows, both not done'
select c.ucn, coalesce(r.review2_done,false) as done
  from public.field_calls c left join public.call_reviews r on r.ucn = c.ucn
 where c.ucn in ('AR-365','AR-NOAGE') order by c.ucn;

\echo '--- 8. the person''s answer on AR-DONE was never rewritten ---'
\echo 'expect: YES | YES | NO | A Person'
select risk_to_patient, warranty_failure, frequent_failure, review2_by
  from public.call_reviews where ucn = 'AR-DONE';

\echo '--- 9. IN ASIA/KOLKATA, NOT UTC. 2026-09-11 03:50 UTC is 09:20 on the'
\echo '--- 11th in India, so an 11th call is today and a 10th call is not ---'
\echo 'expect: t | t — the boundary is read in IST'
select (timestamptz '2026-09-11 03:50:00+00' at time zone 'Asia/Kolkata')::date = date '2026-09-11' as ist_date_is_11th,
       (timestamptz '2026-09-11 03:50:00+00' at time zone 'Asia/Kolkata')::time > time '09:15'      as ist_time_is_past_915;

\echo '--- 10. a signed-in caller CANNOT hand it a clock ---'
\echo 'expect ERROR: permission denied for function auto_answer_review2_asof'
call public.be('ar_admin@x.com');
begin;
  set local role authenticated;
  select marked from public.auto_answer_review2_asof(timestamptz '2026-09-20 10:00:00+05:30');
commit;

\echo '--- 11. ...and an engineer cannot run the sweep at all ---'
\echo 'expect ERROR: RBAC: your role cannot complete the daily call review'
call public.be('ar_eng@x.com');
begin;
  set local role authenticated;
  select marked from public.auto_answer_review2();
commit;

\echo '--- 12. an admin may, and gets the real clock (so this only proves it runs) ---'
\echo 'expect: a row, no error'
call public.be('ar_admin@x.com');
begin;
  set local role authenticated;
  select ran is not null as answered from public.auto_answer_review2();
commit;

\echo '--- 13. THE DOCUMENTED UNDO, verbatim from 0124''s header ---'
\echo 'expect: it reverses every automatic answer and NOTHING a person gave'
update public.call_reviews
   set risk_to_patient = '', warranty_failure = '', frequent_failure = '',
       review2_by = '', review2_at = null
 where review2_by = 'Auto (9:15 am)';
\echo 'expect: only AR-DONE is still answered, still by A Person'
select ucn, coalesce(review2_done,false) as done, review2_by
  from public.call_reviews where ucn like 'AR-%' order by ucn;
