-- ===========================================================================
-- THE CONSUMPTION REPORT VIEW (0142).
--
-- What this suite holds:
--   * the sixteen columns the user's own sheet has, in ITS order, first;
--   * `part` split into CODE and description -- the sheet has two columns where
--     the table has one string;
--   * the two visit dates come from the call's LATEST ENTRY and DISAGREE, which
--     is why both are there;
--   * a line whose call has no visit yet keeps the line and blanks the dates,
--     rather than vanishing from the report.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.spare_consumption  where ucn like 'CR-%';
delete from public.reports            where ucn like 'CR-%';
delete from public.field_calls        where ucn like 'CR-%';
delete from public.handstock_opening  where engineer = 'CR ENG' and source = 'test';

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to)
values ('CR-1','R18471','FIELD','VEGA','226', date '2026-02-03', date '2026-02-03',
        'INDEX HOSPITAL','INDORE','MP','OGP','FiO2 reading swings','Fio2 Variation','PAWAN'),
       -- No visit on this one: the line must still appear, with blank dates.
       ('CR-2','R18999','FIELD','MONNAL T75','9443', date '2026-02-10', date '2026-02-10',
        'APOLLO','INDORE','MP','CMC','Alarm','Alarm 057','PAWAN');

-- TWO entries on CR-1. The later ENTRY is what the report must show, and its
-- visit date is EARLIER than its entry date -- the case the two columns exist
-- for (attended on the 5th, written up on the 9th).
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at) values
 ('CRR1a','CR-1','R18471','Unsolved','PAWAN',
  timestamptz '2026-02-04 09:00+05:30', timestamptz '2026-02-04 09:00+05:30'),
 ('CRR1b','CR-1','R18471','Solved - Report Completed','PAWAN',
  timestamptz '2026-02-05 10:00+05:30', timestamptz '2026-02-09 18:00+05:30');

insert into public.handstock_opening (engineer, part, qty, as_of, source) values
 ('CR ENG','MP-010|OXYGEN SENSOR-Envitec-T50,T60,T75(HSN:90189099)', 10, date '2026-01-01','test'),
 ('CR ENG','KY632200|EXPIRATORY FLOW SENSOR-MT50,MT75,MT60', 10, date '2026-01-01','test');
insert into public.spare_consumption (ucn, call_number, part, qty, engineer) values
 ('CR-1','R18471','MP-010|OXYGEN SENSOR-Envitec-T50,T60,T75(HSN:90189099)', 1, 'CR ENG'),
 ('CR-2','R18999','KY632200|EXPIRATORY FLOW SENSOR-MT50,MT75,MT60', 1, 'CR ENG');

\echo '--- 1. THE FIRST SIXTEEN ARE THE USER''S SHEET, IN ITS ORDER ---'
\echo 'expect: UC Number, Call Number, Call Type, Visit Entry Date,'
\echo 'expect: Visit Date & Time, Visiting Service Engineer, Spares Used,'
\echo 'expect: Part name, QTY, Product, Serial No, Customer, City, Complaint,'
\echo 'expect: Item Status, Call Date -- exactly the screenshot, exactly its order.'
select ordinal_position, column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'consumption_report'
   and ordinal_position <= 16 order by ordinal_position;

\echo '--- 2. ...and every OTHER consumption column follows, at the end ---'
\echo 'expect: t -- the rest of spare_consumption is present to be switched on'
select count(*) = 6 as the_rest_is_there from information_schema.columns
 where table_schema = 'public' and table_name = 'consumption_report'
   and column_name in ('Source','Remarks','GRIR','Original Qty','Adjustment Reason','Line ID');

\echo '--- 3. `part` IS ONE STRING AND TWO COLUMNS ---'
\echo 'expect: MP-010 | OXYGEN SENSOR-Envitec-T50,T60,T75(HSN:90189099)'
\echo 'expect: The table stores "CODE|Description" -- the same string the Part'
\echo 'expect: Master and a hand-stock line use -- and the sheet wants it split.'
\echo 'expect: Split ONCE, in the view, so no consumer repeats it.'
select "Spares Used", "Part name" from public.consumption_report where "UC Number" = 'CR-1';

\echo '--- 4. THE TWO DATES COME FROM THE LATEST ENTRY, AND DISAGREE ---'
\echo 'expect: entry 2026-02-09, visit 2026-02-05 -- attended on the 5th and'
\echo 'expect: written up on the 9th. Both are on the sheet because they differ;'
\echo 'expect: one of them alone would be a different report.'
\echo 'expect: NOT the 2026-02-04 entry: a call''s state comes from the LAST'
\echo 'expect: thing written, which is sync_call_last_visit()''s own ordering.'
select "Visit Entry Date"::date as entry, "Visit Date & Time"::date as visit
  from public.consumption_report where "UC Number" = 'CR-1';

\echo '--- 5. A LINE WHOSE CALL HAS NO VISIT STILL APPEARS ---'
\echo 'expect: CR-2 present, both dates blank. The spare was consumed whether or'
\echo 'expect: not a visit has been written up, and dropping the line would'
\echo 'expect: under-report consumption without anyone seeing it.'
select "UC Number", coalesce("Visit Entry Date"::text, '(none)') as entry,
       coalesce("Visit Date & Time"::text, '(none)') as visit, "QTY"
  from public.consumption_report where "UC Number" = 'CR-2';

\echo '--- 6. THE CALL IS CARRIED AROUND THE LINE ---'
\echo 'expect: VEGA / 226 / INDEX HOSPITAL / INDORE / Fio2 Variation / OGP'
select "Product", "Serial No", "Customer", "City", "Complaint", "Item Status"
  from public.consumption_report where "UC Number" = 'CR-1';

\echo '--- 7. THE VIEW READS AS THE READER, not as its owner ---'
\echo 'expect: t -- security_invoker. A report is exactly the screen where a'
\echo 'expect: leak goes unnoticed, and this project has been bitten three times.'
select coalesce(array_to_string(reloptions, ',') like '%security_invoker=on%', false) as invoker
  from pg_class where oid = 'public.consumption_report'::regclass;
