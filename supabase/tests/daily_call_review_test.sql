-- ===========================================================================
-- Daily Call Review (DCCR) — 0044 + 0045, against a throwaway Postgres.
--   psql ... -f _stub.sql -f <every migration> -f daily_call_review_test.sql
-- Covers: the three review stages and which one Review Status names, the
-- ANY POTENTIAL EFFECT formula, the FFR action a YES calls for, the review
-- dates, `review.edit` on the write policy, and the per-product masters.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com'),
  ('55555555-5555-5555-5555-555555555555','hot@x.com');
insert into public.profiles (id, email, full_name, role) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com','Eng Elan','engineer'),
  ('55555555-5555-5555-5555-555555555555','hot@x.com','Hot Hema','hotline');

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

call public.be('hot@x.com');
insert into public.field_calls (ucn, call_number, reg_date, call_type, party_name, product_name, serial,
                                public_health_threat, death, serious_incident) values
  ('26A02F0001','CL26001','2026-01-02','FIELD','METRO HOSPITAL','VEGA','36','NO','NO','NO'),
  ('26A02F0002','CL26002','2026-01-02','FIELD','THE PRINCIPAL','MONNAL T60','T60-9','NO','NO','NO');

\echo '--- 1. A call with no review row is Review 2 Pending (Review 1 came with registration) ---'
select ucn, review1_at, review1_done, review_status, any_potential_effect
  from public.field_call_review order by ucn;

\echo '--- 2. Review 1 unanswered reads as Review 1 Pending ---'
insert into public.field_calls (ucn, reg_date, call_type, party_name, product_name, serial, public_health_threat, death, serious_incident)
  values ('26A02F0003','2026-01-03','FIELD','X','VEGA','1','','','');
select ucn, review_status from public.field_call_review where ucn = '26A02F0003';

\echo '--- 3. A part-answered Review 2 is still pending; ANY POTENTIAL EFFECT stays blank ---'
insert into public.call_reviews (ucn, call_number, risk_to_patient) values ('26A02F0001','CL26001','NO');
select ucn, review_status, any_potential_effect, review2_at from public.field_call_review where ucn = '26A02F0001';

\echo '--- 4. All three answered NO → NO, no action, Review 3 Pending, review 2 dated ---'
update public.call_reviews set warranty_failure = 'NO', frequent_failure = 'NO' where ucn = '26A02F0001';
select review_status, any_potential_effect, action_taken, (review2_at = current_date) as dated_today
  from public.field_call_review where ucn = '26A02F0001';

\echo '--- 5. Any one YES → YES, and the action is FFR Generation ---'
update public.call_reviews set frequent_failure = 'YES' where ucn = '26A02F0001';
select any_potential_effect, action_taken from public.field_call_review where ucn = '26A02F0001';

\echo '--- 6. The FFR number types over it and is kept ---'
update public.call_reviews set action_taken = 'FFR-001/26' where ucn = '26A02F0001';
select action_taken from public.field_call_review where ucn = '26A02F0001';

\echo '--- 7. Review 3 completes the review, and is dated ---'
update public.call_reviews
   set complaint_grouping = 'FIO2 ISSUE', root_cause_keyword = 'FIO2 CELL', spare_category = 'CONSUMABLE'
 where ucn = '26A02F0001';
select review_status, (review3_at = current_date) as dated_today, complaint_grouping, root_cause_keyword, spare_category
  from public.field_call_review where ucn = '26A02F0001';

\echo '--- 8. Answering back to NO drops the effect; a typed FFR number is NOT thrown away ---'
update public.call_reviews set frequent_failure = 'NO' where ucn = '26A02F0001';
select any_potential_effect, action_taken from public.field_call_review where ucn = '26A02F0001';

\echo '--- 9. A role without review.edit cannot write a review (RLS) ---'
call public.be('eng@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: row-level security (engineer has no review.edit)'
  insert into public.call_reviews (ucn, risk_to_patient) values ('26A02F0002','NO');
rollback;

\echo '--- 10. Hotline holds review.edit, so the same write goes through ---'
call public.be('hot@x.com');
begin;
  set local role authenticated;
  insert into public.call_reviews (ucn, risk_to_patient, warranty_failure, frequent_failure)
    values ('26A02F0002','NO','NO','NO');
  select ucn, review_status, any_potential_effect from public.field_call_review where ucn = '26A02F0002';
commit;

\echo '--- 11. The masters are tagged per product; COMM is common to all ---'
select extra->>'product' as product, count(*)
  from public.masters where name = 'dccrgrouping' group by 1 order by 1;
select count(*) as t60_and_common
  from public.masters
 where name = 'rootcause' and extra->>'product' in ('MONNAL T60', 'COMM');

\echo '--- 12. The same value may exist for two products, but not twice for one ---'
select value, count(*) from public.masters
 where name = 'rootcause' and value = 'Calibration' group by 1;
\echo 'expect ERROR: duplicate key (same value, same product)'
insert into public.masters (name, value, extra)
  values ('rootcause', 'Calibration', jsonb_build_object('product', 'MONNAL T60'));

-- ===========================================================================
-- 0047 — what the reviewer judges the call by, from the report.
-- ===========================================================================
\echo '--- 13. Visits, spares, software version and product age ride on the row ---'
call public.be('hot@x.com');
insert into public.reports (uid, ucn, call_status, engineer, visit_at, updated_at, data) values
  ('T-R1','26A02F0001','Unsolved','AAKASH YADAV','2026-01-02','2026-01-02'::timestamptz,
   jsonb_build_object('Job Done','Performed calibration; sensor replaced','Software Version','1.01')),
  ('T-R2','26A02F0001','Solved - Report Completed','AAKASH YADAV','2026-01-05','2026-01-05'::timestamptz,
   jsonb_build_object('Job Done','Ventilator working satisfactorily','Software Version','1.02'));
insert into public.spare_consumption (ucn, part, qty, engineer) values
  ('26A02F0001','MP-010|OXYGEN SENSOR', 1, 'AAKASH YADAV'),
  ('26A02F0001','EBD-020|DAUGHTER BOARD', 2, 'AAKASH YADAV');
update public.field_calls set warranty_start = '2021-05-01' where ucn = '26A02F0001';

\echo 'expect: 2 visits newest first, sw 1.02 (the LATEST visit), both spares, 1707 days'
select visit_count, sw_version, spares_count, spares_consumed, age_days, age_group
  from public.field_call_review where ucn = '26A02F0001';
select visit_details from public.field_call_review where ucn = '26A02F0001';

\echo '--- 14. A call with no visit and no warranty start reads empty, not wrong ---'
select visit_count, visit_details = '' as no_visits, spares_count,
       age_days is null as no_age, age_group = '' as no_group
  from public.field_call_review where ucn = '26A02F0002';

\echo '--- 15. The age banding matches the register''s buckets ---'
select d as days, public.failure_age_group(d) as grouping
  from unnest(array[null, -5, 0, 364, 365, 729, 730, 1094, 1095, 1824, 1825, 5000]) d;

\echo '--- 16. The summary view answers the stage counters without the report lookups ---'
select review_status, count(*) from public.field_call_review_summary group by 1 order by 1;

-- ===========================================================================
-- 0048 — the visits and spares are matched by CALL NUMBER, not UCN alone.
-- ===========================================================================
\echo '--- 17. Visits and consumption keyed by Call Number (no ucn on the row) still map ---'
insert into public.field_calls (ucn, call_number, reg_date, complaint_date, call_type, party_name,
                                product_name, serial, warranty_start, public_health_threat, death, serious_incident)
values ('26H30F0009','R20007-EXTEND-XT-2166','2026-08-30','2026-08-30','FIELD','AIIMS',
        'EXTEND-XT','2166','2018-10-20','NO','NO','NO');
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at, data) values
  ('CN-1','','R20007-EXTEND-XT-2166','Unsolved','Rithi Admin','2026-08-31','2026-08-31 09:00'::timestamptz,'{}'::jsonb),
  ('CN-2','','R20007-EXTEND-XT-2166','Solved - Report Completed','Rithi Admin','2026-08-31','2026-08-31 11:00'::timestamptz,
   jsonb_build_object('Job Done','test','Software Version','2.4.7'));
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
values ('','R20007-EXTEND-XT-2166','EBD-004|HEATER BLOCK BOARD-ORION',1,'Rithi Admin');

\echo 'expect: 2 visits, sw 2.4.7 from the latest, 1 spare — none of it keyed by ucn'
select visit_count, sw_version, spares_count, spares_consumed
  from public.field_call_review where ucn = '26H30F0009';

\echo '--- 18. A call with a BLANK call number still maps by its own UCN ---'
insert into public.field_calls (ucn, call_number, reg_date, call_type, party_name, product_name, serial,
                                public_health_threat, death, serious_incident)
values ('26H30F0010','','2026-08-30','FIELD','AIIMS','EXTEND-XT','2167','NO','NO','NO');
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at, data)
values ('UC-1','26H30F0010','','Solved - Report Completed','Rithi Admin','2026-08-31','2026-08-31 12:00'::timestamptz,
        jsonb_build_object('Job Done','by ucn only'));
\echo 'expect: 1 visit — and the blank call number must NOT sweep in the other blank-keyed rows'
select visit_count, visit_details from public.field_call_review where ucn = '26H30F0010';
