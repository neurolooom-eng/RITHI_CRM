-- ===========================================================================
-- THE RELIABILITY TEMPLATE'S "Merge WRR" SHEET (0141).
--
-- The fixture REPRODUCES THE USER'S OWN SAMPLE ROW from
-- VEGA__French_Template_Reliability.xlsx -- machine VEGA|8, call 21C17006,
-- serviced 2021-03-17, three spares, symptom "DEVICE NOT GETTING ON", root
-- cause "FUSE". If the composed Comments block does not come back character for
-- character, this suite says so: the template is read by people who know its
-- shape, and a block that is merely similar is a block somebody has to re-type.
--
-- Also held here:
--   * ONE ROW PER VISIT, not per call. A call attended twice is two services --
--     two opportunities for the machine to have failed. Counting it once
--     flatters the failure rate.
--   * a machine is MODEL + SERIAL, never the serial alone.
--   * cancelled calls never appear.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.spare_consumption where ucn like 'RW-%' or ucn like '21%';
delete from public.call_reviews      where ucn like 'RW-%' or ucn like '21%';
delete from public.reports           where ucn like 'RW-%' or ucn like '21%';
delete from public.field_calls       where ucn like 'RW-%' or ucn like '21%';
delete from public.pm_calls          where ucn like 'RW-%' or ucn like '21%';
delete from public.products          where party_name = 'RW FLEET';
delete from public.handstock_opening where engineer = 'E' and source = 'test';

insert into public.products (item_name, serial_number, party_name, warranty_number,
                             warranty_start, warranty_end, extra)
values ('VEGA', '8', 'RW FLEET', 'SA7356', date '2020-11-01', date '2021-10-31',
        '{"Item Code":"VEGA-001","PO No.":"PO-99","Town":"CHENNAI"}'::jsonb),
       -- A SECOND machine with the SAME serial under a different model: a serial
       -- alone is not a machine (3,794 repeat in the real export), and if the
       -- join used it alone this row would poison VEGA|8's warranty dates.
       ('ORION-G', '8', 'RW FLEET', 'WRONG-ONE', date '2015-01-01', date '2016-01-01', '{}'::jsonb);

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to)
values ('21C17006','RW-CN1','FIELD','VEGA','8', date '2021-03-17', date '2021-03-17',
        'RW FLEET','C','S','WARRANTY','MACHINE NOT SWITCHING ON','x','E'),
       ('21D22040','RW-CN2','FIELD','VEGA','8', date '2021-04-28', date '2021-04-28',
        'RW FLEET','C','S','WARRANTY','FIO2 VARIATION','x','E'),
       ('21X00000','RW-CNX','FIELD','VEGA','8', date '2021-05-01', date '2021-05-01',
        'RW FLEET','C','S','WARRANTY','CANCELLED ONE','x','E');
update public.field_calls set cancelled_at = now(), cancel_reason = 'test' where ucn = '21X00000';

-- RW-1 was attended TWICE. Two services, not one.
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at) values
 ('RWR1','21C17006','RW-CN1','Solved - Report Completed','E',
  timestamptz '2021-03-17 10:00+05:30', timestamptz '2021-03-17 10:00+05:30'),
 ('RWR1b','21C17006','RW-CN1','Solved - Report Completed','E',
  timestamptz '2021-05-18 10:00+05:30', timestamptz '2021-05-18 10:00+05:30'),
 ('RWR2','21D22040','RW-CN2','Solved - Report Completed','E',
  timestamptz '2021-04-28 10:00+05:30', timestamptz '2021-04-28 10:00+05:30'),
 ('RWRX','21X00000','RW-CNX','Solved - Report Completed','E',
  timestamptz '2021-05-01 10:00+05:30', timestamptz '2021-05-01 10:00+05:30');

-- `any_potential_effect` is a GENERATED column -- it cannot be inserted, and
-- that is the point of it: it is YES when any of the three Review 2 answers is,
-- so the template's own column cannot drift from the answers behind it. The
-- fixture sets those three.
insert into public.call_reviews (ucn, call_number, complaint_grouping, root_cause_keyword,
                                 risk_to_patient, warranty_failure, frequent_failure,
                                 spare_category, action_taken)
values ('21C17006','RW-CN1','DEVICE NOT GETTING ON','FUSE','NO','YES','NO','SPARE','Fuse blown'),
       ('21D22040','RW-CN2','FIO2 ISSUES','POB','NO','YES','NO','SPARE','Replaced MEB and POB board');

-- The engineer must HOLD the parts first: a database trigger caps every
-- consumption line at the hand-stock balance (hand stock is derived, never
-- stored, so consumption is the control point). Without an opening balance the
-- guard refuses the line -- correctly -- and the Spares Used block comes back
-- empty, which is how this fixture found its own mistake.
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
 ('E','YR010400|FST 2A FUSE (5X20)-EXT', 10, date '2021-01-01','test'),
 ('E','SC001|SERVICE CHARGES (SAC NO:998719)', 10, date '2021-01-01','test'),
 ('E','EM-851|ORG-FUSE T0.63A L250V', 10, date '2021-01-01','test');

insert into public.spare_consumption (ucn, call_number, part, qty, engineer) values
 ('21C17006','RW-CN1','YR010400|FST 2A FUSE (5X20)-EXT', 4, 'E'),
 ('21C17006','RW-CN1','SC001|SERVICE CHARGES (SAC NO:998719)', 1, 'E'),
 ('21C17006','RW-CN1','EM-851|ORG-FUSE T0.63A L250V', 2, 'E');

-- A PM visit BEFORE the second service, so "Date of last preventive maintenance"
-- has something to find -- and after the first, so it must NOT appear there.
insert into public.pm_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                             complaint_date, party_name, city, state, item_status,
                             complaint_reported, standard_complaint, allocated_to)
values ('21PM001','RW-CNP','P M VISIT','VEGA','8', date '2021-04-10', date '2021-04-10',
        'RW FLEET','C','S','WARRANTY','PM','x','E');
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at)
values ('RWRP','21PM001','RW-CNP','Solved - Report Completed','E',
        timestamptz '2021-04-10 10:00+05:30', timestamptz '2021-04-10 10:00+05:30');

\echo '--- 1. ONE ROW PER VISIT, and the cancelled call is absent ---'
\echo 'expect: 3 rows -- RW-1 twice (attended 17 Mar and 18 May) and RW-2 once.'
\echo 'expect: A call attended twice is TWO services in a reliability study: two'
\echo 'expect: opportunities for the machine to have failed. Counting it once'
\echo 'expect: would flatter the failure rate. RW-X is cancelled and never appears.'
select call_reg_no, service_date, serial_number
  from public.reliability_wrr('%VEGA%') order by service_date;

\echo '--- 2. THE MACHINE IS MODEL + SERIAL, never the serial alone ---'
\echo 'expect: warranty SA7356 and installation 2020-11-01 on every row -- NOT'
\echo 'expect: WRONG-ONE/2015-01-01, which is the ORION-G that shares serial 8.'
\echo 'expect: 3,794 serials repeat in the real export; a join on the serial'
\echo 'expect: alone would have taken whichever row came first.'
select distinct warranty_no, installation_date from public.reliability_wrr('%VEGA%');

\echo '--- 3. THE COMMENTS BLOCK, character for character ---'
\echo 'expect: exactly the layout of the user''s own sample row --'
\echo 'expect:   Comments :'
\echo 'expect:   - Reason of service: MACHINE NOT SWITCHING ON'
\echo 'expect:   - Default confirmed (yes/no) : Yes'
\echo 'expect:   - Curative action : 17-Mar-2021 : Fuse blown'
\echo 'expect:   - Spares Used : YR010400 : FST 2A FUSE (5X20)-EXT - 4|SC001 : ...'
\echo 'expect:   - FQI/FRC/FSCA n°: NIL'
select comments from public.reliability_wrr('%VEGA%')
 where call_reg_no = '21C17006' and service_date = date '2021-03-17';

\echo '--- 4. ...and the SPARES read CODE : Description - qty, joined by a bar ---'
\echo 'expect: t -- spare_consumption.part is already "CODE|Description", the'
\echo 'expect: same string the Part Master and a hand-stock line use, so the'
\echo 'expect: sheet''s format is that with the bar swapped and the qty appended.'
select comments like '%YR010400 : FST 2A FUSE (5X20)-EXT - 4|SC001 : SERVICE CHARGES (SAC NO:998719) - 1|EM-851 : ORG-FUSE T0.63A L250V - 2%'
       as spares_match_the_sheet
  from public.reliability_wrr('%VEGA%')
 where call_reg_no = '21C17006' and service_date = date '2021-03-17';

\echo '--- 5. THE DCCR FILLS THE FAILURE COLUMNS ---'
\echo 'expect: DEVICE NOT GETTING ON / FUSE / YES / SPARE -- the DCCR''s columns'
\echo 'expect: ARE the template''s headings, which is not a coincidence.'
select symptoms, root_cause_keyword, any_potential_effect, spare_category
  from public.reliability_wrr('%VEGA%')
 where call_reg_no = '21C17006' and service_date = date '2021-03-17';

\echo '--- 6. LAST PM is the latest one BEFORE that service, not just any ---'
\echo 'expect: blank for the 17 Mar service and 2021-04-10 for the 18 May one.'
\echo 'expect: The PM happened between them, so it is history for the second'
\echo 'expect: service and the future for the first.'
select service_date, coalesce(last_pm_date::text, '(none yet)') as last_pm
  from public.reliability_wrr('%VEGA%')
 where call_reg_no = '21C17006' order by service_date;

\echo '--- 7. WARRANTY PERIOD is judged AT THE SERVICE DATE ---'
\echo 'expect: yes for all three -- warranty runs 2020-11-01 to 2021-10-31 and'
\echo 'expect: every service falls inside it. This asks whether the machine was'
\echo 'expect: under warranty WHEN IT WAS SERVICED, which is what a reliability'
\echo 'expect: study needs, not whether the DCCR called it a warranty failure.'
select service_date, warranty_period from public.reliability_wrr('%VEGA%') order by service_date;
