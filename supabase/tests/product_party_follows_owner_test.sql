-- ===========================================================================
-- THE PRODUCT DATABASE'S PARTY FOLLOWS THE LATEST SALE ENTRY OR OWNERSHIP
-- TRANSFER (0457; the user, 2026-10-27, VEGA | 31). Every error printed is
-- labelled `expect ERROR` -- this suite expects none.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.parties (party_name, address, city, state, service_engineer) values
  ('PPF NEW OWNER', 'Transferee Road', 'PUNE', 'MAHARASHTRA', 'ENG TWO')
on conflict do nothing;

\echo
\echo '--- 1. an upload cannot give a sold machine another party ---'
insert into public.sale_entries (sa_number, party_name, entry_at, address, city, state) values
  ('SA-PPF1', 'PPF BUYER', '2021-03-15', 'Buyer Street', 'KANPUR', 'UTTAR PRADESH');
insert into public.sale_items (sa_number, product_name, serial_number) values ('SA-PPF1', 'PPF VEGA', '31');
-- What the AppSheet import did: the master row's party written straight over.
update public.products set party_name = 'PPF WRONG, AHMEDABAD', address = 'Elsewhere' where machine_key = 'ppf vega|31';
select (select party_name = 'PPF BUYER' from public.products where machine_key = 'ppf vega|31')
       as "the uploaded party is discarded: the sale entry's buyer stands";
insert into public.products (item_name, serial_number, party_name) values ('PPF VEGA', '31', 'PPF WRONG AGAIN')
on conflict (machine_key) do update set party_name = excluded.party_name;
select (select party_name = 'PPF BUYER' from public.products where machine_key = 'ppf vega|31')
       as "...and so is an upsert's, the way the bulk upload writes";

\echo
\echo '--- 2. a later transfer moves the party and the details ---'
insert into public.ownership_transfers (item_name, serial_number, from_party, to_party, transfer_date, reference_no)
values ('PPF VEGA', '31', 'PPF BUYER', 'PPF NEW OWNER', '2025-03-01', 'OT-PPF1');
select (select party_name = 'PPF NEW OWNER' and address = 'Transferee Road' and city = 'PUNE' and service_engineer = 'ENG TWO'
          from public.products where machine_key = 'ppf vega|31')
       as "the transferee, with its Party Master address, city and engineer";
update public.products set pm_visits = 2 where machine_key = 'ppf vega|31';
select (select party_name = 'PPF NEW OWNER' and address = 'Transferee Road' from public.products where machine_key = 'ppf vega|31')
       as "an update of another column leaves a correct party and address alone";
update public.products set address = 'Corrected Road' where machine_key = 'ppf vega|31';
select (select address = 'Corrected Road' from public.products where machine_key = 'ppf vega|31')
       as "...and a corrected address for the right owner stands";

\echo
\echo '--- 3. a machine with neither a sale nor a transfer keeps its imported party ---'
insert into public.products (item_name, serial_number, party_name) values ('PPF VEGA', '031', 'PPF IMPORTED');
update public.products set party_name = 'PPF IMPORTED EDIT' where machine_key = 'ppf vega|031';
select (select party_name = 'PPF IMPORTED EDIT' from public.products where machine_key = 'ppf vega|031')
       as "no sale, no transfer: the rule says nothing and the row keeps what it is given";

\echo
\echo '--- 4. the one-time mapping ran, and recorded what it changed ---'
select exists (select 1 from public.one_time_fixes_done where name = '0457_product_party_follows_latest_owner')
       as "recorded as done, so a replayed bundle never repeats it";
select not has_table_privilege('authenticated', 'public.products_party_remap_backup', 'select')
    or not exists (select 1 from pg_policies where tablename = 'products_party_remap_backup')
       as "the backup has no policy: service role only";
