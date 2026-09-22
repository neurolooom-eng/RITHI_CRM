-- ===========================================================================
-- FEEDBACK WITHOUT A REPORT (0229).
--
--   The user, 2026-09-22: "If a Customer Feedback is Present for the Said
--   Call, there should be a Report which is Solved - Report Completed. If it
--   is not Present then list it."
--
-- The two that carry weight are the ones that decide whether a row is a
-- finding at all, and both are about SPELLING rather than logic:
--
--   * `Solved - Report Completed ` with a trailing space is the spelling the
--     real exports carry -- all 378 rows of the file this was written for --
--     and a string comparison would have reported every one of those calls as
--     missing its report;
--   * a call completed and then RE-VISITED still has its report, so the test
--     is "any visit", not "the latest visit".
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.feedback where call_number like 'FWR-%';
delete from public.reports where uid like 'fwr-%';

insert into public.field_calls (ucn, call_number, party_name, product_name, serial, reg_date) values
 ('FWR-OK',      'FWR-1', 'ALMS', 'ORION-G', '1001', '2026-09-01'),
 ('FWR-PENDING', 'FWR-2', 'ALMS', 'ORION-G', '1002', '2026-09-01'),
 ('FWR-NOVISIT', 'FWR-3', 'ALMS', 'ORION-G', '1003', '2026-09-01'),
 ('FWR-REVISIT', 'FWR-4', 'ALMS', 'ORION-G', '1004', '2026-09-01'),
 ('FWR-NOFB',    'FWR-5', 'ALMS', 'ORION-G', '1005', '2026-09-01')
on conflict do nothing;

\echo '--- 1. the status is matched on its LETTERS, not its punctuation ---'
\echo 'expect: t t t t, then f f f -- the first four are the spellings that'
\echo 'reach this system; Report PENDING is a different status and must not'
\echo 'read as completed'
select public.is_report_completed('Solved - Report Completed')      as plain,
       public.is_report_completed('Solved - Report Completed ')     as trailing_space,
       public.is_report_completed('solved-report_completed')        as lower_and_underscore,
       public.is_report_completed('Solved – Report Completed') as en_dash,
       public.is_report_completed('Solved - Report Pending')        as pending,
       public.is_report_completed('Solved')                         as solved,
       public.is_report_completed(null)                             as nothing;

insert into public.reports (uid, ucn, call_status, visit_at, updated_at, manual_report) values
 -- THE SPELLING THE REAL EXPORT CARRIES.
 ('fwr-1', 'FWR-OK',      'Solved - Report Completed ', '2026-09-02', '2026-09-02', 'https://drive.google.com/file/d/1/view'),
 ('fwr-2', 'FWR-PENDING', 'Solved - Report Pending',    '2026-09-02', '2026-09-02', ''),
 -- Completed FIRST, then visited again. The report exists.
 ('fwr-4a','FWR-REVISIT', 'solved-report_completed',    '2026-09-02', '2026-09-02', 'https://drive.google.com/file/d/2/view'),
 ('fwr-4b','FWR-REVISIT', 'Unsolved',                   '2026-09-05', '2026-09-05', ''),
 -- A completed report on a call with NO feedback. Not this report's business.
 ('fwr-5', 'FWR-NOFB',    'Solved - Report Completed',  '2026-09-02', '2026-09-02', 'https://drive.google.com/file/d/3/view');

insert into public.feedback (ucn, call_number, party_name, engineer) values
 ('FWR-OK',      'FWR-1', 'ALMS', 'A'),
 ('fwr-pending ','FWR-2', 'ALMS', 'B'),   -- case and a trailing space, as imports arrive
 ('FWR-NOVISIT', 'FWR-3', 'ALMS', 'C'),
 ('FWR-REVISIT', 'FWR-4', 'ALMS', 'D'),
 ('FWR-GHOST',   'FWR-8', 'ALMS', 'E'),   -- names a call this system has not got
 ('',            'FWR-9', 'ALMS', 'F');   -- no UCN at all

\echo '--- 2. the four findings, one per row ---'
\echo 'expect exactly these four, ordered by the finding:'
\echo '  fwr-pending a visit exists but none reads Solved - Report Completed'
\echo '  FWR-GHOST   no call with that UCN'
\echo '  FWR-NOVISIT no visit at all'
\echo '  (blank)     the feedback records no UCN'
select coalesce(nullif(btrim(ucn), ''), '(blank)') as ucn, missing, latest_visit_status
  from public.feedback_without_report
 where call_number like 'FWR-%' order by 2, 1;

\echo '--- 3. THE TRAILING SPACE IS NOT A MISSING REPORT ---'
\echo 'expect: 0 -- FWR-OK''s only visit reads "Solved - Report Completed "'
\echo 'with a trailing space, which is what every row of the real export'
\echo 'carries. A string comparison would list all of them.'
select count(*) as ok_is_listed from public.feedback_without_report where ucn = 'FWR-OK';

\echo '--- 4. A RE-VISIT DOES NOT UNDO THE REPORT ---'
\echo 'expect: 0 -- the completed visit was filed first and a later Unsolved'
\echo 'visit followed. The report exists, so this is not a finding; asking only'
\echo 'the LATEST visit would report it.'
select count(*) as revisit_is_listed from public.feedback_without_report where ucn = 'FWR-REVISIT';

\echo '--- 5. a call with a report and no feedback is not this report''s business ---'
\echo 'expect: 0'
select count(*) as nofb_is_listed from public.feedback_without_report where ucn = 'FWR-NOFB';

\echo '--- 6. the row carries what the reader needs to act ---'
\echo 'expect: the call''s registration date, the party, and the status the'
\echo 'latest visit DOES read -- "Solved - Report Pending" is a known absence'
\echo 'and "Unsolved" would be a different problem'
select ucn, call_number, party_name, reg_date, latest_visit_status, latest_visit_uid
  from public.feedback_without_report where btrim(ucn) = 'fwr-pending';

\echo '--- 7. the key was merged into the three roles that see every module ---'
\echo 'expect: 3'
select count(*) as roles_with_key from public.app_roles
 where permissions ? 'mod:/feedback-without-report';

\echo '--- 8. the view applies RLS to the READER ---'
\echo 'expect: t -- without security_invoker it would run as its owner and'
\echo 'every signed-in user would read every call on it (0040/0050/0057)'
select exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'feedback_without_report'
     and 'security_invoker=on' = any (c.reloptions)) as invoker_on;

\echo '--- 9. cleanup ---'
delete from public.feedback where call_number like 'FWR-%';
delete from public.reports where uid like 'fwr-%';
delete from public.field_calls where call_number like 'FWR-%';
