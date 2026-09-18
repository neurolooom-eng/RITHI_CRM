-- ===========================================================================
-- A SPARE NEEDS A VISIT BEHIND IT (0214).
--
--   The user, 2026-09-18: "Visit Entry Date is Empty, Visit Date & Time is
--   Empty -- No Consumption should be accepted without these Details."
--
-- THE POSITIVE IS THE RISKY ONE. A guard that refuses too much would break the
-- main reporting flow, which is the path every engineer uses every day — so the
-- first assertion is that an ordinary save still goes through.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.spare_consumption where ucn like 'VIS-%';
delete from public.reports            where ucn like 'VIS-%';
delete from public.field_calls        where ucn like 'VIS-%';
delete from public.handstock_opening  where engineer = 'VIS ENG';

insert into public.field_calls (ucn, call_number, party_name) values
 ('VIS-WITH', 'CN-W', 'ACME'),
 ('VIS-NONE', 'CN-N', 'ACME');
-- Stock, or the hand-stock cap refuses first and the suite proves nothing about
-- the rule under test. (It did, on the first run.)
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('VIS ENG', 'P|Sensor', 50, current_date, 'test');
-- Only ONE of the two calls has been visited.
insert into public.reports (ucn, call_number, engineer, visit_at, updated_at, uid)
values ('VIS-WITH', 'CN-W', 'VIS ENG', now(), now(), 'VIS-V1');

\echo ''
\echo '--- 1. THE ORDINARY PATH STILL WORKS: visit filed, then the spare ---'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
values ('VIS-WITH', 'CN-W', 'P|Sensor', 1, 'VIS ENG');
select 'a spare on a visited call' as check, count(*)::text as should_be_1
  from public.spare_consumption where ucn = 'VIS-WITH';

\echo ''
\echo '--- 2. ...and a call with NO visit is refused ---'
\echo 'expect ERROR: no visit has been filed'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
values ('VIS-NONE', 'CN-N', 'P|Sensor', 1, 'VIS ENG');
select 'a spare on an unvisited call' as check, count(*)::text as should_be_0
  from public.spare_consumption where ucn = 'VIS-NONE';

\echo ''
\echo '--- 3. file the visit, and the same spare goes in ---'
-- The remedy the refusal names, proved rather than asserted.
insert into public.reports (ucn, call_number, engineer, visit_at, updated_at, uid)
values ('VIS-NONE', 'CN-N', 'VIS ENG', now(), now(), 'VIS-V2');
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
values ('VIS-NONE', 'CN-N', 'P|Sensor', 1, 'VIS ENG');
select 'once the visit exists' as check, count(*)::text as should_be_1
  from public.spare_consumption where ucn = 'VIS-NONE';

\echo ''
\echo '--- 4. the report columns fill themselves, with nothing re-entered ---'
-- Both columns come from the JOIN, which is why the fix is at the visit and not
-- on the consumption row.
select 'visit columns on the report' as check,
       (count(*) filter (where "Visit Entry Date" is not null
                           and "Visit Date & Time" is not null))::text as should_be_2
  from public.consumption_report where "UC Number" like 'VIS-%';
