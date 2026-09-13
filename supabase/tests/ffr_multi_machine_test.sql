-- ===========================================================================
-- ONE PAPER REPORT, SEVERAL MACHINES (0181) — and a re-load still corrects.
-- Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo ''
\echo '=== 1. the 2018 register: 16/18 covers four machines ==================='
-- Keyed on ffr_no alone this was ONE row and three machines were overwritten.
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name,
       product_serial, installation_date, problem_reported, imported_from)
values ('16/18','Mail','18L26015','2018-12-31','S.P.INSTITUTE OF NEUROSCIENCES','252','2018-07-24','VENTILATION MODE WORKING ISSUE','2018 sheet'),
       ('16/18','Mail','18L26013','2018-12-31','S.P.INSTITUTE OF NEUROSCIENCES','253','2018-07-24','VENTILATION MODE WORKING ISSUE','2018 sheet'),
       ('16/18','Mail','18L26014','2018-12-31','S.P.INSTITUTE OF NEUROSCIENCES','254','2018-07-24','VENTILATION MODE WORKING ISSUE','2018 sheet'),
       ('16/18','Mail','18L26044','2018-12-31','S.P.INSTITUTE OF NEUROSCIENCES','255','2018-07-24','VENTILATION MODE WORKING ISSUE','2018 sheet');
select count(*) as machines_should_be_4 from public.field_failure_reports where ffr_no = '16/18';

\echo ''
\echo '=== 2. a RE-LOAD corrects those rows, it does not add them ============='
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name,
       product_serial, problem_reported, imported_from)
values ('16/18','Mail','18L26015','2018-12-31','S.P. INSTITUTE OF NEUROSCIENCES, SOLAPUR','252','VENTILATION MODE WORKING ISSUE','2018 sheet'),
       ('16/18','Mail','18L26013','2018-12-31','S.P. INSTITUTE OF NEUROSCIENCES, SOLAPUR','253','VENTILATION MODE WORKING ISSUE','2018 sheet')
on conflict (ffr_no, product_serial) do update
   set customer_name = excluded.customer_name;
select count(*) as still_4 from public.field_failure_reports where ffr_no = '16/18';
select product_serial, customer_name from public.field_failure_reports
 where ffr_no = '16/18' order by product_serial;

\echo ''
\echo '=== 3. the SAME machine twice under one number is still refused ========'
\echo '    expect ERROR below -- the pair is the identity'
insert into public.field_failure_reports (ffr_no, source, product_serial, imported_from)
values ('16/18','Mail','252','2018 sheet');

\echo ''
\echo '=== 4. a report raised HERE still gets its own number =================='
-- 0181 loosened the key; it did not loosen the NUMBERING. next_ffr_no(yr) reads
-- the highest already issued for the year, so two raised reports cannot collide.
select public.next_ffr_no(26::smallint) as first_number;
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported)
values (public.next_ffr_no(26::smallint), 'PC', 'F-NEW-1', current_date, 'Hospital N', 'alarm 12');
select public.next_ffr_no(26::smallint) as second_number_must_differ;

\echo ''
\echo '=== 5. loading 2016-2019 does not disturb the 2026 counter ============='
select public.next_ffr_no(26::smallint) as still_2026_series;

\echo ''
\echo '=== 6. the old single-column key is GONE ==============================='
select count(*) as old_unique_should_be_0
  from pg_constraint where conname = 'field_failure_reports_ffr_no_key';
select indexdef as pair_index from pg_indexes
 where schemaname = 'public' and indexname = 'ffr_no_machine_uniq';
