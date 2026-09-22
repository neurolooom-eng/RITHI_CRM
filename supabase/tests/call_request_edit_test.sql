-- ===========================================================================
-- CORRECTING A CALL REQUEST (0232).
--
--   The user, 2026-09-22: "Add a Provision in Call Request for me to edit it."
--
-- A request may be corrected while it is PENDING. Once it has become a call the
-- sixteen columns describing WHAT was asked for stop moving, because the call
-- carries them from that moment and the call is what everything downstream
-- reads; the correction belongs there, where it is audited.
--
-- THE TWO THINGS WORTH PROVING ARE THE TWO HALVES OF ONE RULE: the content
-- freezes, and the DISPOSITION does not. A guard that froze the whole row would
-- refuse the very updates that move a request out of Pending -- registering it
-- and cancelling it -- so it would look correct and break the workflow.
--
-- AND THE MESSAGE IS ASSERTED, NOT ONLY THE REFUSAL. The first version of this
-- guard appended to a text[] without a cast, so Postgres chose array||array and
-- it raised `malformed array literal: "Serial No"`. It refused the write, which
-- is what a test of the refusal alone would have recorded as a pass.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.call_requests where reqid like 'CRE-%';
insert into public.call_requests (reqid, status, party_name, product, serial_no, standard_complaint, call_type)
values ('CRE-1', 'Pending',    'A HOSPITAL', 'MONNAL T60', '20788', 'Alarm 053', 'FIELD'),
       ('CRE-2', 'Registered', 'B HOSPITAL', 'MONNAL T75', '11389', 'Alarm 023', 'FIELD'),
       ('CRE-3', 'Cancelled',  'C HOSPITAL', 'ORION-G',    '2410',  'Alarm 011', 'FIELD'),
       ('CRE-4', 'Mapped',     'D HOSPITAL', 'ORION-G',    '2411',  'Alarm 011', 'FIELD');

\echo '--- 1. a PENDING request can be corrected ---'
\echo 'expect: the corrected serial and party'
update public.call_requests
   set serial_no = '20789', party_name = 'A HOSPITAL (CORRECTED)', plan_date = '2026-10-01'
 where reqid = 'CRE-1';
select reqid, serial_no, party_name, plan_date from public.call_requests where reqid = 'CRE-1';

\echo '--- 2. a request with NO status is pending too ---'
\echo 'expect: 99999 -- a row loaded before status existed is not frozen'
update public.call_requests set status = null where reqid = 'CRE-1';
update public.call_requests set serial_no = '99999' where reqid = 'CRE-1';
select serial_no from public.call_requests where reqid = 'CRE-1';

\echo '--- 3. a REGISTERED request refuses a content change, and NAMES the fields ---'
\echo 'expect ERROR: This request is already Registered — Party, Serial No cannot be changed here'
update public.call_requests set serial_no = '11111', party_name = 'X' where reqid = 'CRE-2';

\echo '--- 4. ...so does a MAPPED one, and a CANCELLED one ---'
\echo 'expect ERROR twice: already Mapped; already Cancelled'
update public.call_requests set product = 'SOMETHING ELSE' where reqid = 'CRE-4';
update public.call_requests set reported_problem = 'something else' where reqid = 'CRE-3';

\echo '--- 5. THE DISPOSITION STILL MOVES IN EVERY STATE ---'
\echo 'expect: CRE-2 keeps its serial and gains a cancel reason -- a guard that'
\echo 'froze the whole row would refuse the very updates that answer a request'
update public.call_requests
   set status = 'Cancelled', cancel_reason = 'duplicate', cancelled_at = now()
 where reqid = 'CRE-2';
select reqid, status, serial_no, cancel_reason from public.call_requests where reqid = 'CRE-2';

\echo '--- 6. ...including registering one ---'
\echo 'expect: Registered, with a UCN, and the content untouched'
update public.call_requests set status = 'Pending' where reqid = 'CRE-4';
update public.call_requests
   set status = 'Registered', ucn = '26I22F0009', actioned_by = 'Somebody', actioned_at = now()
 where reqid = 'CRE-4';
select reqid, status, ucn, product from public.call_requests where reqid = 'CRE-4';

\echo '--- 7. an update that changes nothing is never refused ---'
\echo 'expect: no error -- writing the same values back is not a change, and a'
\echo 'form that sends every field would otherwise be refused for touching none'
update public.call_requests set serial_no = serial_no, party_name = party_name where reqid = 'CRE-3';
select reqid, serial_no from public.call_requests where reqid = 'CRE-3';

\echo '--- 8. cleanup ---'
delete from public.call_requests where reqid like 'CRE-%';
