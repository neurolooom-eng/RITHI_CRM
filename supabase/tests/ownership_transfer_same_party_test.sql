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
\echo '=== 4. the invariant is KEPT: a file naming both sides the same ========'
\echo '    expect ERROR below -- a transfer between one party and itself is not one'
insert into public.ownership_transfers (serial_number, from_party, to_party)
values ('OT-C','FIRST OWNER','FIRST OWNER');

\echo ''
\echo '=== 5. a chain loaded in date order still records each hop ============='
insert into public.ownership_transfers (serial_number, to_party, transfer_date)
values ('OT-C','SECOND OWNER','2023-01-01');
insert into public.ownership_transfers (serial_number, to_party, transfer_date)
values ('OT-C','THIRD OWNER','2024-01-01');
select transfer_date, from_party, to_party from public.ownership_transfers
 where serial_number = 'OT-C' order by transfer_date;
