-- ===========================================================================
-- SOLD THROUGH IS THE DEALER, AND A DEALER GETS NO INSTALLATION CALL (0328).
--
-- The user, 2026-10-03: a sale may be made to a DEALER; a dealer gets no
-- installation call; when the dealer sells the machine an Ownership Transfer
-- is recorded and the installation call is raised from it (OT-PRODUCT-SERIAL);
-- Sold Through monitors the dealer, on the transfer, the sale and the Product
-- Database.
--
-- What this proves, as `authenticated` where it matters:
--   1. A transfer FROM a party the Party Master types DEALER records that
--      dealer as Sold Through; a value the caller sends is discarded; a
--      transfer between customers records none.
--   2. The Product Database's Sold Through becomes the dealer, and re-saving
--      the sale does not wipe it.
--   3. An installation call for a DEALER party is refused, however inserted;
--      the customer's OT- call goes in; moving an existing call onto a dealer
--      is refused too.
--   4. ONCE: the Sold Through 0318 cleared is put back on a line whose entry
--      had none or a different one; a line edited since, or matching its
--      entry, is left alone; a second run changes nothing.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values ('5d000000-0000-0000-0000-000000000001', 'st_admin@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, active)
values ('5d000000-0000-0000-0000-000000000001', 'st_admin@x.com', 'St Admin', 'admin', true)
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.parties (party_name, party_type) values
  ('ST DEALER', 'DEALER'), ('ST CLINIC', 'CUSTOMER'), ('ST HOSPITAL', 'CUSTOMER');

-- A sale TO the dealer: one machine.
insert into public.sale_entries (sa_number, party_name, party_type, warranty_start, warranty_end)
values ('SA-ST1', 'ST DEALER', 'DEALER', '2026-01-01', '2027-12-31');
insert into public.sale_items (uid, sa_number, product_name, serial_number) values ('ST-U1', 'SA-ST1', 'ST VENT', 'ST-1');

\echo '--- 1. SOLD THROUGH ON A TRANSFER IS THE DEALER IT CAME FROM ---'
call public.be('st_admin@x.com');
begin;
  set local role authenticated;
  insert into public.ownership_transfers (serial_number, item_name, from_party, to_party, transfer_date, reference_no, sold_through)
  values ('ST-1', 'ST VENT', 'ST DEALER', 'ST CLINIC', current_date, 'ST-REF-1', 'SOMEBODY TYPED THIS');
commit;
\echo 'expect: ST DEALER (the typed value discarded)'
select sold_through from public.ownership_transfers where serial_number = 'ST-1';
begin;
  set local role authenticated;
  insert into public.ownership_transfers (serial_number, item_name, from_party, to_party, transfer_date, reference_no)
  values ('ST-1', 'ST VENT', 'ST CLINIC', 'ST HOSPITAL', current_date + 1, 'ST-REF-2');
commit;
\echo 'expect: blank -- a customer passing it on is not a dealer sale'
select coalesce(nullif(sold_through, ''), '(blank)') from public.ownership_transfers where serial_number = 'ST-1' and from_party = 'ST CLINIC';

\echo '--- 2. THE PRODUCT DATABASE CARRIES THE DEALER, AND KEEPS IT ---'
\echo 'expect: ST HOSPITAL | ST DEALER -- the customer who passed it on is not a dealer, so the dealer stays'
select party_name, sold_through from public.products where serial_number = 'ST-1';
update public.sale_entries set other_details = 're-saved' where sa_number = 'SA-ST1';
update public.sale_items set other_details = 're-saved' where uid = 'ST-U1';
\echo 'expect: ST DEALER still, after the sale is re-saved'
select sold_through from public.products where serial_number = 'ST-1';

\echo '--- 3. NO INSTALLATION CALL FOR A DEALER ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: ST DEALER is a dealer: an installation call is not raised for a dealer'
  insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                         complaint_reported, standard_complaint, call_number)
  values ('ST-I1', 'INSTALLATION', 'ST VENT', 'ST-1', current_date, 'st dealer ', 'INSTALLATION CALL', 'INSTALLATION CALL', 'WI-ST VENT-ST-1');
commit;
begin;
  set local role authenticated;
  insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                         complaint_reported, standard_complaint, call_number)
  values ('ST-I2', 'INSTALLATION', 'ST VENT', 'ST-1', current_date, 'ST CLINIC', 'INSTALLATION CALL', 'INSTALLATION CALL', 'OT-ST VENT-ST-1');
commit;
\echo 'expect: the customer''s OT- call is in -- OT-ST VENT-ST-1 | ST CLINIC'
select call_number, party_name from public.installation_calls where ucn = 'ST-I2';
begin;
  set local role authenticated;
  \echo 'expect ERROR: ST DEALER is a dealer'
  update public.installation_calls set party_name = 'ST DEALER' where ucn = 'ST-I2';
commit;

\echo '--- 4. ONCE: THE SOLD THROUGH 0318 CLEARED IS PUT BACK ---'
-- Four lines as 0318 left them (own value NULL, the old one in the backup):
--   L1 entry has none        -> lost      -> put back
--   L2 entry says ST DEALER  -> replaced  -> put back (DEALER B)
--   L3 edited since (value)  -> kept as edited
--   L4 same as its entry     -> not touched (stays following the entry)
insert into public.sale_entries (sa_number, party_name, sold_through) values
  ('SA-ST2', 'ST CLINIC', ''), ('SA-ST3', 'ST CLINIC', 'ST DEALER');
insert into public.sale_items (uid, sa_number, product_name, serial_number, sold_through) values
  ('ST-L1', 'SA-ST2', 'ST VENT', 'L-1', null),
  ('ST-L2', 'SA-ST3', 'ST VENT', 'L-2', null),
  ('ST-L3', 'SA-ST3', 'ST VENT', 'L-3', 'EDITED SINCE'),
  ('ST-L4', 'SA-ST3', 'ST VENT', 'L-4', null);
insert into public.sale_items_inherit_backup (item_id, sa_number, serial_number, before)
select id, sa_number, serial_number,
       jsonb_build_object('sold_through', case serial_number when 'L-1' then 'DEALER A' when 'L-2' then 'DEALER B'
                                                             when 'L-3' then 'DEALER C' else 'ST DEALER' end)
  from public.sale_items where uid in ('ST-L1', 'ST-L2', 'ST-L3', 'ST-L4');
delete from public.one_time_fixes_done where name = '0328_sold_through_restored';
\ir ../migrations/0328_sold_through_dealer_workflow.sql
\echo 'expect: L-1 DEALER A | L-2 DEALER B | L-3 EDITED SINCE | L-4 (null: follows its entry)'
select serial_number, coalesce(sold_through, '(null)') from public.sale_items where uid like 'ST-L%' order by serial_number;
\echo 'expect: the marker says 2 lines'
select detail from public.one_time_fixes_done where name = '0328_sold_through_restored';
update public.sale_items set sold_through = null where uid = 'ST-L1';
\ir ../migrations/0328_sold_through_dealer_workflow.sql
\echo 'expect: a second run leaves L-1 as it now is (null)'
select coalesce(sold_through, '(null)') from public.sale_items where uid = 'ST-L1';

\echo '--- 5. THE PUBLIC KEY CALLS NONE OF IT ---'
\echo 'expect: f | f | f'
select has_function_privilege('anon', 'public.party_is_dealer(text)', 'EXECUTE') as is_dealer,
       has_function_privilege('authenticated', 'public.installation_call_not_for_dealer()', 'EXECUTE') as call_guard,
       has_function_privilege('authenticated', 'public.ownership_transfer_sold_through()', 'EXECUTE') as stamp;
