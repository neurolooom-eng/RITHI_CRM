-- ===========================================================================
-- 0224 — calls reading Solved whose visit record is incomplete.
--
-- Each fixture is ONE of the four gaps, plus one call that is complete and one
-- that is not solved, because a report is only as good as what it LEAVES OUT.
-- ===========================================================================
\set ON_ERROR_STOP off
set session_replication_role = replica;   -- fixtures only

insert into public.field_calls (ucn, call_type, reg_date, party_name, product_name, serial, last_status)
values ('SWR-1','BREAKDOWN', current_date - 10, 'P','MOD','S1','Solved'),
       ('SWR-2','BREAKDOWN', current_date - 10, 'P','MOD','S2','Solved'),
       ('SWR-3','BREAKDOWN', current_date - 10, 'P','MOD','S3','Solved'),
       ('SWR-4','BREAKDOWN', current_date - 10, 'P','MOD','S4','Solved'),
       ('SWR-5','BREAKDOWN', current_date - 10, 'P','MOD','S5','Solved'),
       ('SWR-6','BREAKDOWN', current_date - 10, 'P','MOD','S6','Unsolved');

-- SWR-1: no visit row at all.
-- SWR-2: a visit whose ENTRY DATE is an import stamp. `updated_at` is NOT NULL
-- and defaults to now(), so a file with no Visit Entry Date does not leave a
-- blank — it takes the import moment, shared by the whole batch. Thirty rows
-- to the same microsecond is the signature; one is not.
insert into public.reports (uid, ucn, visit_at, updated_at, manual_report, call_status)
select 'V-2-'||g, case when g = 1 then 'SWR-2' else 'SWR-BATCH-'||g end,
       now() - interval '5 days', timestamptz '2026-01-02 03:04:05.000001+00', 'report.pdf', 'Solved'
from generate_series(1,30) g;
-- SWR-3: a visit with no SERVICE REPORT.
insert into public.reports (uid, ucn, visit_at, updated_at, manual_report, call_status)
values ('V-3','SWR-3', now() - interval '5 days', now() - interval '5 days', '', 'Solved');
-- SWR-4: a visit with no VISIT DATE.
insert into public.reports (uid, ucn, visit_at, updated_at, manual_report, call_status)
values ('V-4','SWR-4', null, now() - interval '5 days', 'report.pdf', 'Solved');
-- SWR-5: COMPLETE — must not appear.
insert into public.reports (uid, ucn, visit_at, updated_at, manual_report, call_status)
values ('V-5','SWR-5', now() - interval '5 days', now() - interval '5 days', 'report.pdf', 'Solved');
-- SWR-6: not solved — must not appear, however incomplete.
set session_replication_role = origin;

\echo '--- each gap is named, and only the incomplete solved calls are listed ---'
select ucn, missing from public.solved_without_report
 where ucn like 'SWR-%' order by ucn;

\echo '--- 1. no visit at all ---'
select case when missing = 'no visit at all' then 'PASS' else 'FAIL ' || missing end
  from public.solved_without_report where ucn = 'SWR-1';
\echo '--- 2. the entry date is the import moment, not a recorded one ---'
select case when missing like 'entry date looks like an import stamp (30 visits share it)%'
            then 'PASS' else 'FAIL ' || missing end
  from public.solved_without_report where ucn = 'SWR-2';
\echo '--- 3. no service report ---'
select case when missing = 'no service report' then 'PASS' else 'FAIL ' || missing end
  from public.solved_without_report where ucn = 'SWR-3';
\echo '--- 4. no visit date ---'
select case when missing = 'no visit date' then 'PASS' else 'FAIL ' || missing end
  from public.solved_without_report where ucn = 'SWR-4';

\echo '--- A COMPLETE VISIT IS NOT LISTED. A report that cries wolf is one'
\echo '--- people stop reading, and this one exists to be acted on. ---'
select case when count(*) = 0 then 'PASS' else 'FAIL — a complete call was listed' end
  from public.solved_without_report where ucn = 'SWR-5';

\echo '--- AND NEITHER IS AN UNSOLVED CALL, however incomplete: it has not'
\echo '--- claimed to be finished, so there is nothing contradictory yet. ---'
select case when count(*) = 0 then 'PASS' else 'FAIL — an unsolved call was listed' end
  from public.solved_without_report where ucn = 'SWR-6';

\echo '--- MORE THAN ONE GAP ON ONE ROW IS LISTED IN FULL, not just the first:'
\echo '--- being told, fixing it, and being told the next is three round trips. ---'
set session_replication_role = replica;
insert into public.field_calls (ucn, call_type, reg_date, party_name, product_name, serial, last_status)
values ('SWR-7','BREAKDOWN', current_date - 10, 'P','MOD','S7','Solved');
insert into public.reports (uid, ucn, visit_at, updated_at, manual_report, call_status)
values ('V-7','SWR-7', null, timestamptz '2026-01-02 03:04:05.000001+00', '', 'Solved');
set session_replication_role = origin;
select case when missing like 'no visit date · entry date looks like an import stamp%· no service report'
            then 'PASS' else 'FAIL ' || missing end
  from public.solved_without_report where ucn = 'SWR-7';

\echo '--- the ADMIN KEY was merged, and into those three roles only ---'
select case when count(*) = 3 then 'PASS' else 'FAIL — ' || count(*) || ' roles hold it' end
  from public.app_roles where permissions ? 'mod:/missing-visit-reports';
