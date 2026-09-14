-- ===========================================================================
-- cover_state() answers the sheet's thirty-day band, and the views answer with
-- it.
--
-- The number used to be sixty and 0036 said so: the supplied PDF printed these
-- columns' OUTPUTS ("emits values including ABOUT TO EXPIRE, ACTIVE,
-- INACTIVE") and withheld the formula. The formula export supplies it, the
-- same on all four sheets:
--
--   IF(end>=Today(), IF(end<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
--
-- Every expectation below is worked from THAT expression, not read back off
-- the function. `>=` and `<=` are both inclusive, so today and the thirtieth
-- day are both "about to expire" and the thirty-first is not.
--
-- Run: psql ... -f supabase/tests/cover_expiry_test.sql
-- The only errors in the output should be the ones labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off

\echo
\echo '-- the four boundaries, from the sheet expression --'
select
  public.cover_state(current_date - 1)  = 'INACTIVE'        as "yesterday inactive",
  public.cover_state(current_date)      = 'ABOUT TO EXPIRE' as "today about to expire",
  public.cover_state(current_date + 30) = 'ABOUT TO EXPIRE' as "day 30 about to expire",
  public.cover_state(current_date + 31) = 'ACTIVE'          as "day 31 active";

\echo
\echo '-- and the one deliberate deviation: a blank end date --'
-- In Sheets an empty cell compared with >=Today() is TRUE, so the sheet calls
-- a machine with no end date ACTIVE. That is a comparison artefact, and
-- "active" is the one wrong answer for an unknown.
select public.cover_state(null) = 'NOT COVERED' as "unknown is not covered";

\echo
\echo '-- the band is not still sixty: day 45 must be ACTIVE --'
-- The regression this file exists for. At the old threshold a contract with
-- 45 days to run was listed as about to expire and chased.
select public.cover_state(current_date + 45) = 'ACTIVE' as "45 days out is active";

\echo
\echo '-- and the REGISTERS answer with it, not just the function --'
-- The views are what the screens read; the function is only right if they
-- reach it. Two contracts, 20 days and 45 days out.
begin;
insert into public.contract_entries (mc_number, party_name, contract_start, contract_end)
values ('MC-TEST-20', 'TEST PARTY', current_date - 345, current_date + 20),
       ('MC-TEST-45', 'TEST PARTY', current_date - 320, current_date + 45);
insert into public.contract_items (mc_number, product_code, product_name, serial_number)
values ('MC-TEST-20', 'ORION-G', 'Orion G', 'TESTSN20'),
       ('MC-TEST-45', 'ORION-G', 'Orion G', 'TESTSN45');

select mc_number, contract_state from public.contract_details
where mc_number in ('MC-TEST-20', 'MC-TEST-45') order by mc_number;

select
  (select contract_state from public.contract_details where mc_number = 'MC-TEST-20')
    = 'ABOUT TO EXPIRE' as "20 days out is about to expire",
  (select contract_state from public.contract_details where mc_number = 'MC-TEST-45')
    = 'ACTIVE'          as "45 days out is active on the view too";

insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end)
values ('SA-TEST-20', 'TEST PARTY', current_date - 345, current_date + 20),
       ('SA-TEST-45', 'TEST PARTY', current_date - 320, current_date + 45);
insert into public.sale_items (sa_number, product_code, product_name, serial_number)
values ('SA-TEST-20', 'ORION-G', 'Orion G', 'TESTSW20'),
       ('SA-TEST-45', 'ORION-G', 'Orion G', 'TESTSW45');

select
  (select warranty_state from public.warranty_sale_details where sa_number = 'SA-TEST-20')
    = 'ABOUT TO EXPIRE' as "warranty 20 days out is about to expire",
  (select warranty_state from public.warranty_sale_details where sa_number = 'SA-TEST-45')
    = 'ACTIVE'          as "warranty 45 days out is active";
rollback;

\echo
\echo '-- done --'
