-- ===========================================================================
-- A RECONCILIATION DOES NOT NEED A VISIT BEHIND IT (0243).
--
--   The user, 2026-09-26: "Exempt reconciliation from the visit rule and fix
--   it" (finding 47). Reported as: AJAY G (INDOOR SERVICE) held seven parts,
--   all received by TRANSFER, and "Add consumption (reconciliation)" could book
--   none of them against 26G06F0006 -- a call with no visit filed.
--
-- WHAT THIS PROVES, and why each half is here:
--   1. the exemption: a Reconciliation line on a call with no visit is taken,
--      and comes off stock that arrived by transfer, as in the report;
--   2. THE RULE STILL HOLDS for every other source -- without this the suite
--      would pass a database that had dropped 0214 altogether;
--   3. the other reconciliation guards still bite: the hand-stock cap and "No
--      call found";
--   4. the exemption is not a way round the rule for everybody: an engineer
--      without consumption.reconcile who writes source = 'Reconciliation' is
--      refused by the insert policy;
--   5. what the user accepts with it: with no visit, the report's two visit
--      dates are the BOOKING time (0215's fallback) and Visit UID is blank;
--      filing the visit later replaces all three with the real ones.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- ---- personas -------------------------------------------------------------
insert into auth.users (id, email) values
  ('0243c000-0000-0000-0000-000000000001', 'rec-coord@x.com'),
  ('0243e000-0000-0000-0000-000000000002', 'rec-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0243c000-0000-0000-0000-000000000001', 'rec-coord@x.com', 'Rec Coord', 'spare_coordinator'),
  ('0243e000-0000-0000-0000-000000000002', 'rec-eng@x.com',   'REC ENG',   'engineer')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

-- ---- fixture: one call, NO visit, stock that arrived by transfer ----------
insert into public.field_calls (ucn, call_number, party_name, allocated_to)
values ('REC-NOVISIT', 'CN-REC', 'ACME', 'REC ENG');
-- The SOURCE engineer holds the stock, and TRANSFERS two to REC ENG, so the
-- transfer guard runs as it does in use rather than being switched off.
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('REC SRC', 'KY550200|MOTHER BOARD - OSIRIS 3', 5, current_date, 'test');
insert into public.stock_transfers (uid, from_engineer, to_engineer, remarks)
values ('ST-REC', 'REC SRC', 'REC ENG', 'covering the site');
insert into public.stock_transfer_lines (transfer_uid, part, qty)
values ('ST-REC', 'KY550200|MOTHER BOARD - OSIRIS 3', 2);

select 'the fixture: stock by transfer, no visit' as check,
       (select on_hand from public.handstock_balance
         where engineer_key = 'rec eng' and part_code = 'KY550200')::text as on_hand_should_be_2,
       (select count(*) from public.reports where ucn = 'REC-NOVISIT')::text as visits_should_be_0;

\echo ''
\echo '--- 1. THE EXEMPTION: the Spare Coordinator books a reconciliation on the unvisited call ---'
call public.be('rec-coord@x.com');
set role authenticated;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, grir, remarks, recorded_by, source)
values ('REC-NOVISIT', 'CN-REC', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'REC ENG', '',
        'fitted on site, never reported', 'Rec Coord', 'Reconciliation');
reset role;
select 'a reconciliation with no visit' as check,
       (select count(*) from public.spare_consumption where ucn = 'REC-NOVISIT')::text as should_be_1,
       (select on_hand from public.handstock_balance
         where engineer_key = 'rec eng' and part_code = 'KY550200')::text as on_hand_should_be_1;

\echo ''
\echo '--- 2. THE RULE STILL HOLDS for every other source ---'
-- As the table owner, so only the triggers speak: this is about 0214, not a
-- policy. Named explicitly and left blank -- a blank source is filled with
-- 'Report' before the visit guard reads it.
\echo 'expect ERROR: no visit has been filed (source Report)'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, source)
values ('REC-NOVISIT', 'CN-REC', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'REC ENG', 'Report');
\echo 'expect ERROR: no visit has been filed (source left blank)'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
values ('REC-NOVISIT', 'CN-REC', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'REC ENG');
select 'only the reconciliation got in' as check,
       (select count(*) from public.spare_consumption where ucn = 'REC-NOVISIT')::text as should_be_1;

\echo ''
\echo '--- 3. the other reconciliation guards still bite ---'
call public.be('rec-coord@x.com');
set role authenticated;
\echo 'expect ERROR: has 1 of KY550200 in hand (the hand-stock cap)'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, remarks, source)
values ('REC-NOVISIT', 'CN-REC', 'KY550200|MOTHER BOARD - OSIRIS 3', 5, 'REC ENG',
        'more than is in hand', 'Reconciliation');
\echo 'expect ERROR: No call found with UCN (a mistyped UCN is not waved through)'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, remarks, source)
values ('REC-NO-SUCH-CALL', '', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'REC ENG',
        'typo', 'Reconciliation');
\echo 'expect ERROR: A reconciliation needs a reason'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, remarks, source)
values ('REC-NOVISIT', 'CN-REC', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'REC ENG',
        '', 'Reconciliation');
reset role;

\echo ''
\echo '--- 4. NOT A WAY ROUND THE RULE: an engineer cannot claim the source ---'
call public.be('rec-eng@x.com');
set role authenticated;
select 'the engineer may not reconcile' as check,
       public.has_perm('consumption.reconcile')::text as should_be_false;
\echo 'expect ERROR: new row violates row-level security policy'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, remarks, source)
values ('REC-NOVISIT', 'CN-REC', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 'REC ENG',
        'skipping the visit', 'Reconciliation');
reset role;
select 'still only the one line' as check,
       (select count(*) from public.spare_consumption where ucn = 'REC-NOVISIT')::text as should_be_1;

\echo ''
\echo '--- 5. what it costs, and the remedy ---'
-- NOT blank, which is what 0214's comment would lead you to expect: 0215 falls
-- back to the first booking for both dates. The UID cannot be approximated.
select 'before a visit is filed' as check,
       (count(*) filter (where "Visit Date & Time" = created_at
                           and "Visit Entry Date"  = created_at))::text as dates_are_the_booking_should_be_1,
       (count(*) filter (where coalesce("Visit UID", '') = ''))::text as uid_blank_should_be_1
  from public.consumption_report r
  join public.spare_consumption c on c.id = r."Line ID"
 where r."UC Number" = 'REC-NOVISIT';
insert into public.reports (ucn, call_number, engineer, visit_at, updated_at, uid)
values ('REC-NOVISIT', 'CN-REC', 'REC ENG', '2026-09-19 09:00+05:30', now(), 'REC-V1');
select 'once the visit is filed' as check,
       (count(*) filter (where "Visit Date & Time" = '2026-09-19 09:00+05:30'::timestamptz))::text as real_visit_date_should_be_1,
       (count(*) filter (where "Visit UID" = 'REC-V1'))::text as uid_should_be_1
  from public.consumption_report where "UC Number" = 'REC-NOVISIT';
