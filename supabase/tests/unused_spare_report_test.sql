-- ===========================================================================
-- NOT CONSUMED AGAINST THIS CALL (0147).
--
-- The value of this report is in what it does NOT say. A flag that fires on a
-- refused request, or on a part somebody renamed, is worse than no flag: it
-- sends an engineer to look for something that was never sent, and after two of
-- those nobody reads the report again.
--
-- So every case below is a line that LOOKS like a finding and is not, plus the
-- one that is:
--
--   1. dispatched, never booked                     -> ON the report
--   2. dispatched and booked                        -> off
--   3. REJECTED by an approver                      -> off (never arrived)
--   4. DROPPED by Stores                            -> off (never arrived)
--   5. still awaiting approval                      -> off (never arrived)
--   6. booked with a RENAMED description            -> off (matched on the code)
--   7. booked against a DIFFERENT call              -> ON (this call is the question)
--   8. received, and the consumption was VOIDED     -> ON, Short (0 of 1 used)
--   9. 2 sent, 1 consumed                           -> ON, Short by 1
--  10. 2 sent on TWO lines, 2 consumed once         -> off (summed, not per line)
--  11. the call is NOT SOLVED                       -> off (still in the van)
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- Cleared at the TOP, so a second run tests the same thing as the first.
delete from public.spare_consumption   where ucn like 'USR-%';
delete from public.spare_request_lines where request_uid like 'USR-REQ-%';
delete from public.spare_requests      where uid like 'USR-REQ-%';
delete from public.field_calls         where ucn like 'USR-%';

insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values ('USR-1', 'FIELD', 'ORION-G', '9001', current_date, 'HOSP ONE', 'x', 'y', 'ENG ONE'),
       ('USR-2', 'FIELD', 'ORION-G', '9002', current_date, 'HOSP TWO', 'x', 'y', 'ENG ONE');

-- SOLVED, because the report only speaks about finished calls. `open_state` is
-- generated from last_status (0032), so it is set the way the register sets it:
-- by the visit that closed the call.
insert into public.reports (ucn, call_number, call_status, engineer, visit_at)
values ('USR-1','CL-USR-1','Solved - Report Completed','ENG ONE', now()),
       ('USR-2','CL-USR-2','Solved - Report Completed','ENG ONE', now());
select public.sync_call_last_visit('USR-1');
select public.sync_call_last_visit('USR-2');

insert into public.spare_requests (uid, or_no, ucn, call_number, engineer, party_name,
                                   product_name, serial, item_status)
values ('USR-REQ-1', 'OR-7001', 'USR-1', 'CL-USR-1', 'ENG ONE', 'HOSP ONE', 'ORION-G', '9001', 'AMC'),
       ('USR-REQ-2', 'OR-7002', 'USR-2', 'CL-USR-2', 'ENG ONE', 'HOSP TWO', 'ORION-G', '9002', 'AMC');

-- Eight lines on request 1, one per case above (case 7 sits on request 2).
insert into public.spare_request_lines (request_uid, part, qty, stores_status, received_at,
                                        rm_approval, commercial_approval, nsm_approval, dc_number)
values
 ('USR-REQ-1', 'KY650300|REMOVABLE AIR INTAKE FILTER', 1, 'Dispatched', null,     'Approved', 'Approved', 'Approved', 'DC-1'),
 ('USR-REQ-1', 'KB030100|HEPA FILTER MONNAL T75',      1, 'Dispatched', null,     'Approved', 'Approved', 'Approved', 'DC-1'),
 ('USR-REQ-1', 'KY732558|MAINTENANCE KIT-T75',         1, null,         null,     'Rejected', '',         '',         null),
 ('USR-REQ-1', 'MP-010|OXYGEN SENSOR-Envitec',         1, 'Dropped',    null,     'Approved', 'Approved', 'Approved', null),
 ('USR-REQ-1', 'KY632200|EXPIRATORY FLOW SENSOR',      1, null,         null,     '',         '',         '',         null),
 ('USR-REQ-1', 'RY117900|GOLD CONTACT KIT',            1, 'Dispatched', null,     'Approved', 'Approved', 'Approved', 'DC-1'),
 ('USR-REQ-1', 'RKY641700|MICROPROCESSOR BOARD',       1, 'Dispatched', now(),    'Approved', 'Approved', 'Approved', 'DC-1'),
 -- case 9: TWO sent, one used
 ('USR-REQ-1', 'KY111111|A PART SENT TWICE OVER',      2, 'Dispatched', null,     'Approved', 'Approved', 'Approved', 'DC-1'),
 -- case 10: the SAME part on two lines, one each — summed they are two, and
 -- two are booked, so neither line is a finding.
 ('USR-REQ-1', 'KY222222|SPLIT ACROSS TWO LINES',      1, 'Dispatched', null,     'Approved', 'Approved', 'Approved', 'DC-1'),
 ('USR-REQ-1', 'KY222222|SPLIT ACROSS TWO LINES',      1, 'Dispatched', null,     'Approved', 'Approved', 'Approved', 'DC-3');
insert into public.spare_request_lines (request_uid, part, qty, stores_status, rm_approval, commercial_approval, nsm_approval, dc_number)
values ('USR-REQ-2', 'KY999999|A PART USED ON ANOTHER CALL', 1, 'Dispatched', 'Approved', 'Approved', 'Approved', 'DC-2');

-- What was booked. Note the deliberate variations.
-- Consumption is CAPPED at what the engineer holds (0061), so the stock has to
-- exist before anything can be booked against it. `source` is mandatory -- an
-- opening balance without one is a number nobody can account for.
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('ENG ONE', 'KB030100|HEPA FILTER MONNAL T75', 50, current_date - 30, 'Opening'),
       ('ENG ONE', 'RY117900|GOLD CONTACT KIT', 50, current_date - 30, 'Opening'),
       ('ENG ONE', 'RKY641700|MICROPROCESSOR BOARD', 50, current_date - 30, 'Opening'),
       ('ENG ONE', 'KY999999|A PART USED ON ANOTHER CALL', 50, current_date - 30, 'Opening'),
       ('ENG ONE', 'KY111111|A PART SENT TWICE OVER', 50, current_date - 30, 'Opening'),
       ('ENG ONE', 'KY222222|SPLIT ACROSS TWO LINES', 50, current_date - 30, 'Opening')
on conflict do nothing;

insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
values
 -- case 2: booked, same string
 ('USR-1', 'CL-USR-1', 'KB030100|HEPA FILTER MONNAL T75', 1, 'ENG ONE'),
 -- case 6: booked, DESCRIPTION RENAMED — same code, so it must still clear
 ('USR-1', 'CL-USR-1', 'RY117900|Gold contact kit (T75/T60)', 1, 'ENG ONE'),
 -- case 7: booked on the WRONG call — must NOT clear USR-2's line
 ('USR-1', 'CL-USR-1', 'KY999999|A PART USED ON ANOTHER CALL', 1, 'ENG ONE'),
 -- case 8: booked, and voided to 0 below — a void is an UPDATE, never an
 -- insert of zero (0049 keeps the row; 0060 refuses a zero-quantity booking).
 ('USR-1', 'CL-USR-1', 'RKY641700|MICROPROCESSOR BOARD', 1, 'ENG ONE'),
 -- case 9: only ONE of the two booked
 ('USR-1', 'CL-USR-1', 'KY111111|A PART SENT TWICE OVER', 1, 'ENG ONE'),
 -- case 10: both booked in one entry, against two dispatch lines
 ('USR-1', 'CL-USR-1', 'KY222222|SPLIT ACROSS TWO LINES', 2, 'ENG ONE');

update public.spare_consumption
   set qty = 0, adjustment_reason = 'Voided — booked against the wrong call'
 where ucn = 'USR-1' and part like 'RKY641700%';

\echo '--- 1. WHAT THE REPORT SAYS ---'
\echo 'expect: exactly FOUR rows —'
\echo 'expect:   USR-1 KY111111  Short     2 sent, 1 used, short 1'
\echo 'expect:   USR-1 KY650300  Not used  1 sent, 0 used'
\echo 'expect:   USR-1 RKY641700 Not used  1 sent, booked then VOIDED to 0'
\echo 'expect:   USR-2 KY999999  Not used  (booked, but against USR-1)'
select ucn, "Part Code", "Finding", "Qty Sent", "Qty Used", "Qty Short"
  from public.unused_spare_report
 where ucn like 'USR-%'
 order by ucn, "Part Code";

\echo '--- 2. NOTHING THAT NEVER ARRIVED ---'
\echo 'expect: 0 rows. A refused request, a part Stores dropped and a line still'
\echo 'expect: waiting on an approver are all "nothing was sent", not "sent and'
\echo 'expect: not used" — flagging them sends somebody to look for a part that'
\echo 'expect: was never in the van.'
select "Part Code", 'should not be here' as problem
  from public.unused_spare_report
 where ucn like 'USR-%'
   and "Part Code" in ('KY732558', 'MP-010', 'KY632200');

\echo '--- 3. A RENAMED DESCRIPTION STILL CLEARS THE LINE ---'
\echo 'expect: 0 rows. RY117900 was booked as "Gold contact kit (T75/T60)"'
\echo 'expect: against a request that said "GOLD CONTACT KIT". Same code, same'
\echo 'expect: part; matching the whole string would report it as unused because'
\echo 'expect: somebody re-typed the name.'
select "Part Code", 'matched on the string, not the code' as problem
  from public.unused_spare_report
 where ucn like 'USR-%' and "Part Code" = 'RY117900';

\echo '--- 4. A VOIDED CONSUMPTION LEAVES A SHORTFALL ---'
\echo 'expect: RKY641700, Not used, 1 sent and 0 used. The booking was voided to'
\echo 'expect: zero, so nothing is accounted for any more — and that IS the'
\echo 'expect: finding once quantities are compared rather than mere presence.'
select "Part Code", "Finding", "Qty Sent", "Qty Used"
  from public.unused_spare_report
 where ucn like 'USR-%' and "Part Code" = 'RKY641700';

\echo '--- 4b. A PART SENT ON TWO LINES IS SUMMED, NOT COMPARED LINE BY LINE ---'
\echo 'expect: 0 rows. KY222222 went out as 1 + 1 and was booked as 2. Comparing'
\echo 'expect: each LINE against the call would flag both as short — the false'
\echo 'expect: finding that made this an aggregate rather than a per-line report.'
select "Part Code", 'compared per line' as problem
  from public.unused_spare_report
 where ucn like 'USR-%' and "Part Code" = 'KY222222';

\echo '--- 5. THE CALL CONTEXT COMES WITH IT ---'
\echo 'expect: the customer, product, serial and engineer, so the report can be'
\echo 'expect: acted on without opening each call.'
select "Part Code", "Customer", "Product", "Serial No", "Engineer", "DC No"
  from public.unused_spare_report
 where ucn = 'USR-1';

\echo '--- 6. IT READS AS THE READER ---'
\echo 'expect: t — security_invoker, so a role that cannot see a call cannot see'
\echo 'expect: its spares through this view either.'
select coalesce(array_to_string(reloptions, ',') like '%security_invoker=on%', false) as invoker
  from pg_class where relname = 'unused_spare_report' and relnamespace = 'public'::regnamespace;

\echo '--- 7. AN OPEN CALL IS NOT A FINDING ---'
\echo 'expect: 0 rows once USR-1 is put back to unsolved. While a call is open'
\echo 'expect: the part is legitimately still in the van — the engineer has not'
\echo 'expect: finished, and consumption is booked when the work is done. A'
\echo 'expect: report that cries wolf on live work is one people learn to close.'
update public.reports set call_status = 'Unsolved' where ucn = 'USR-1';
select public.sync_call_last_visit('USR-1');
select ucn, "Part Code", 'flagged while open' as problem
  from public.unused_spare_report where ucn = 'USR-1';

\echo '--- 7b. ...and it comes back when the call is solved ---'
\echo 'expect: the same rows as section 1 for USR-1. The finding was never'
\echo 'expect: wrong, only early.'
update public.reports set call_status = 'Solved - Report Completed' where ucn = 'USR-1';
select public.sync_call_last_visit('USR-1');
select count(*) as usr1_rows from public.unused_spare_report where ucn = 'USR-1';

delete from public.reports where ucn like 'USR-%';

-- Leave nothing behind.
delete from public.spare_consumption   where ucn like 'USR-%';
delete from public.spare_request_lines where request_uid like 'USR-REQ-%';
delete from public.spare_requests      where uid like 'USR-REQ-%';
delete from public.field_calls         where ucn like 'USR-%';
delete from public.handstock_opening   where engineer = 'ENG ONE' and (part like 'K%' or part like 'R%');
