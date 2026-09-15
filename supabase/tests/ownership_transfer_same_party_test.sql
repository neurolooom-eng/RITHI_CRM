-- ===========================================================================
-- A TRANSFER IS NOT REFUSED BECAUSE THE MACHINE IS ALREADY THERE (0182).
-- Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.products (serial_number, item_name, party_name) values
 ('OT-A','MONNAL T75','APOLLO HOSPITAL'),
 ('OT-B','ORION-G','CITY HOSPITAL'),
 ('OT-C','EXTEND-XT','FIRST OWNER')
on conflict do nothing;

\echo ''
\echo '=== 1. THE REPORTED CASE: the master has already caught up ============='
-- 0072 filled from_party from the master, which returned the DESTINATION, so
-- from = to and the constraint took the whole file down on its first row.
insert into public.ownership_transfers (serial_number, to_party, transfer_date)
values ('OT-A','APOLLO HOSPITAL','2024-05-01');
select serial_number,
       case when btrim(from_party) = '' then 'EMPTY (not known)' else from_party end as from_party,
       to_party
  from public.ownership_transfers where serial_number = 'OT-A';
\echo '    from_party must read EMPTY -- the master cannot name the predecessor,'
\echo '    and saying "Apollo to Apollo" would be inventing one.'

\echo ''
\echo '=== 2. the fill STILL WORKS where the master can answer ================'
insert into public.ownership_transfers (serial_number, to_party, transfer_date)
values ('OT-B','NEW OWNER HOSPITAL','2024-06-01');
select from_party as should_be_city_hospital, to_party
  from public.ownership_transfers where serial_number = 'OT-B';

\echo ''
\echo '=== 3. the machine still MOVES ========================================='
select party_name as should_be_new_owner_hospital
  from public.products where serial_number = 'OT-B';

\echo ''
\echo '=== 4. a file naming both sides the same LOADS, with from left empty ==='
-- This ASSERTED AN ERROR until 0183, and the change is deliberate. The first
-- real export held back 2,985 of 4,327 rows this way: its Party Name (FROM)
-- resolves to the CURRENT owner, so every already-applied hand-over names its
-- own destination. Refusing those discarded real records -- an OT number, a
-- date, a machine -- for the sake of one value that was never information.
insert into public.ownership_transfers (serial_number, from_party, to_party, reference_no)
values ('OT-C','FIRST OWNER','FIRST OWNER','OT-SAME-1');
select case when btrim(from_party) = '' then 'EMPTY (not known)' else from_party end as from_party,
       to_party
  from public.ownership_transfers where reference_no = 'OT-SAME-1';

\echo ''
\echo '=== 5. a chain loaded in date order still records each hop ============='
-- EACH HOP NEEDS ITS OWN OT NUMBER. The key is (reference_no, serial_number),
-- and both of these inserts used to omit the reference — so the second collided
-- with the first on ('', 'OT-C') and THIS WHOLE SECTION NEVER RAN. It failed
-- with an unlabelled duplicate-key error that nobody read as a failure, because
-- the suite's convention is that only labelled errors appear and an unlabelled
-- one at the bottom of a long output looks like part of the scenery.
-- Found by the isolated validation run, 2026-09-15.
insert into public.ownership_transfers (serial_number, to_party, transfer_date, reference_no)
values ('OT-C','SECOND OWNER','2023-01-01','OT-CHAIN-2');
insert into public.ownership_transfers (serial_number, to_party, transfer_date, reference_no)
values ('OT-C','THIRD OWNER','2024-01-01','OT-CHAIN-3');
select transfer_date, from_party, to_party from public.ownership_transfers
 where serial_number = 'OT-C' order by transfer_date;

\echo ''
\echo '=== 6. THE REAL EXPORT: its own "From Party" is the CURRENT owner ======'
-- Reported from use: 2,985 of 4,327 rows held back, every one "already with
-- <party> — not a transfer". The AppSheet sheet resolves Party Name (FROM) to
-- whoever holds the machine NOW, so every already-applied hand-over reads back
-- as going where it already is. These are real hand-overs with an OT number,
-- a date and a machine; only the predecessor is unknown (0183).
insert into public.products (serial_number, item_name, party_name)
values ('EXP-1','ANAVENT','APOLLO HOSPITALS,NELLORE-6918') on conflict do nothing;
insert into public.ownership_transfers (serial_number, from_party, to_party, transfer_date, reference_no)
values ('EXP-1','APOLLO HOSPITALS,NELLORE-6918','APOLLO HOSPITALS,NELLORE-6918','2022-07-10','OT10001');
select reference_no,
       case when btrim(from_party) = '' then 'EMPTY (not known)' else from_party end as from_party,
       to_party
  from public.ownership_transfers where reference_no = 'OT10001';
\echo '    the hand-over is KEPT -- only the value that was never information is dropped'

\echo ''
\echo '=== 7. ...and the invariant is still declared, just unreachable ========'
select count(*) as constraint_still_there
  from pg_constraint where conname = 'ownership_transfer_parties_differ';
