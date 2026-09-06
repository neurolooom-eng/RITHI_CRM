-- ===========================================================================
-- WHEN A VISIT CAN HAVE HAPPENED (0115).
--
--   * not in the future — a call's status comes from its LATEST visit, so a
--     visit dated next week closes a call nobody has been to;
--   * not before the complaint — nobody attended a fault not yet reported.
--
-- And the part that is easy to get wrong: HISTORY IS EXEMT BY DESIGN. The
-- superseded system's visits load into this same table and must load exactly as
-- they were. The rule governs what the Visit Update form writes (uid WEB-...)
-- and nothing else, so tests 5 and 6 assert that the two import paths still
-- work with dates the form would refuse. If those ever start failing, the
-- register gains a gap instead of an imperfection.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to, complaint_date)
values ('VD-1', 'FIELD', 'VDPROD', '1', current_date - 10, 'HOSP', 'x', 'y', 'ENG', current_date - 5)
on conflict (ucn) do update set complaint_date = excluded.complaint_date;
-- A call with NO complaint date: rule 2 has nothing to compare against.
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values ('VD-2', 'FIELD', 'VDPROD', '2', current_date - 10, 'HOSP', 'x', 'y', 'ENG')
on conflict (ucn) do nothing;

\echo '--- 1. a visit today is fine ---'
\echo 'expect: INSERT 0 1'
insert into public.reports (uid, ucn, visit_at, call_status)
values ('WEB-A1', 'VD-1', (current_date::text || 'T00:00:00Z')::timestamptz, 'Unsolved');

\echo '--- 2. ...and so is one between the complaint and today ---'
\echo 'expect: INSERT 0 1'
insert into public.reports (uid, ucn, visit_at, call_status)
values ('WEB-A2', 'VD-1', ((current_date - 3)::text || 'T00:00:00Z')::timestamptz, 'Unsolved');

\echo '--- 3. TOMORROW is refused ---'
\echo 'expect ERROR: cannot be dated in the future'
insert into public.reports (uid, ucn, visit_at, call_status)
values ('WEB-A3', 'VD-1', ((current_date + 1)::text || 'T00:00:00Z')::timestamptz, 'Unsolved');

\echo '--- 4. BEFORE THE COMPLAINT is refused ---'
\echo 'expect ERROR: cannot be dated before the complaint'
insert into public.reports (uid, ucn, visit_at, call_status)
values ('WEB-A4', 'VD-1', ((current_date - 6)::text || 'T00:00:00Z')::timestamptz, 'Unsolved');

\echo '--- 5. HISTORY STILL LOADS: Bulk Uploads (uid IMP-...) ---'
\echo 'expect: INSERT 0 1 twice -- a visit before its complaint, and one dated'
\echo 'in the future. Neither is judged: this is the record of what happened.'
insert into public.reports (uid, ucn, visit_at, call_status)
values ('IMP-VD-1-20200101', 'VD-1', ((current_date - 900)::text || 'T00:00:00Z')::timestamptz, 'Solved');
insert into public.reports (uid, ucn, visit_at, call_status)
values ('IMP-VD-1-20990101', 'VD-1', ((current_date + 400)::text || 'T00:00:00Z')::timestamptz, 'Solved');

\echo '--- 6. ...and Bulk Report Mapping (its own uid, carrying source_ref) ---'
\echo 'expect: INSERT 0 1'
insert into public.reports (uid, ucn, visit_at, call_status, source_ref)
values ('a7f3-appsheet-ref', 'VD-1', ((current_date - 900)::text || 'T00:00:00Z')::timestamptz, 'Solved', 'a7f3');

\echo '--- 7. a call with NO complaint date is held to the FUTURE rule only ---'
\echo 'expect: INSERT 0 1, then ERROR on the future one'
insert into public.reports (uid, ucn, visit_at, call_status)
values ('WEB-B1', 'VD-2', ((current_date - 400)::text || 'T00:00:00Z')::timestamptz, 'Unsolved');
\echo 'expect ERROR: cannot be dated in the future'
insert into public.reports (uid, ucn, visit_at, call_status)
values ('WEB-B2', 'VD-2', ((current_date + 1)::text || 'T00:00:00Z')::timestamptz, 'Unsolved');

\echo '--- 8. a visit with NO date at all is not this trigger''s business ---'
\echo 'expect: INSERT 0 1 -- the form requires one; a row without is somebody'
\echo 'else''s rule to make'
insert into public.reports (uid, ucn, visit_at, call_status)
values ('WEB-B3', 'VD-2', null, 'Unsolved');

\echo '--- 9. correcting an old report WITHOUT touching its date is allowed ---'
\echo 'expect: UPDATE 1 -- the historical row from test 5, whose date the form'
\echo 'would refuse. A report corrected later must not be blocked by a rule'
\echo 'about when it was entered.'
update public.reports set call_status = 'Solved - Report Completed'
 where uid = 'IMP-VD-1-20990101';

\echo '--- 10. but MOVING a form-entered visit into the future is refused ---'
\echo 'expect ERROR: cannot be dated in the future'
update public.reports set visit_at = ((current_date + 30)::text || 'T00:00:00Z')::timestamptz
 where uid = 'WEB-A1';

\echo '--- 11. what the register actually holds now ---'
\echo 'expect: WEB-A1, WEB-A2, WEB-B1, WEB-B3 and the three imported rows'
select uid, (visit_at at time zone 'UTC')::date as visit_day
  from public.reports where ucn like 'VD-%' order by uid;

\echo '--- 12. cleanup ---'
delete from public.reports where ucn like 'VD-%';
delete from public.field_calls where ucn like 'VD-%';
