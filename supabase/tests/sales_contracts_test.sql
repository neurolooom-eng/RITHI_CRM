-- ===========================================================================
-- Sale / Warranty and Contract registers (0036_sales_contracts.sql).
--   A common value lives on the HEADER; the item's column is an override.
--   Effective value = coalesce(item, header) — so editing the header moves
--   every item that has not pinned its own value, and the machine master
--   (products) follows.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','comm@x.com'),
 ('aaaaaaaa-0000-0000-0000-000000000002','eng@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('aaaaaaaa-0000-0000-0000-000000000001','comm@x.com','Commercial Cat','commercial'),
 ('aaaaaaaa-0000-0000-0000-000000000002','eng@x.com','Engineer Eng','engineer');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

-- The machines these registers cover.
insert into public.products (party_name,item_name,serial_number,item_status)
  values ('CITY HOSPITAL-1','MONNAL T75','430','OGP'),
         ('CITY HOSPITAL-1','ORION-G','5289','OGP');

\echo '--- 1. a sale header and two machines under it ---'
insert into public.sale_entries
  (sa_number, party_name, invoice_no, invoice_date, warranty_start, warranty_end,
   warranty_years, warranty_months, pm_visits, state, city, engineer)
  values ('SA100','CITY HOSPITAL-1','M12/24-25','2024-04-01','2024-04-01','2025-03-31',1,12,3,'TAMIL NADU','CHENNAI','SIVAKUMAR');
insert into public.sale_items (sa_number, product_code, product_name, serial_number)
  values ('SA100','KB033600','MONNAL T75','430'),
         ('SA100','PRD-009','ORION-G','5289');
select uid, warranty_start, warranty_end, pm_visits, city, coalesce(array_length(overridden,1),0) as pinned
  from public.warranty_sale_details where sa_number='SA100' order by uid;

\echo '--- 2. the machine master picked the cover up (WGP while it runs) ---'
select serial_number, warranty_number, warranty_start, warranty_end, item_status
  from public.products order by serial_number;

\echo '--- 3. EDIT THE HEADER -> every inheriting item moves with it ---'
update public.sale_entries set warranty_end='2026-03-31', warranty_months=24, city='COIMBATORE' where sa_number='SA100';
select uid, warranty_end, warranty_months, city from public.warranty_sale_details where sa_number='SA100' order by uid;
select serial_number, warranty_end from public.products order by serial_number;

\echo '--- 4. an item may PIN its own value; the header no longer moves it ---'
update public.sale_items set warranty_end='2025-12-31' where uid='SA100|ORION-G|5289';
update public.sale_entries set warranty_end='2027-03-31' where sa_number='SA100';
select uid, warranty_end, overridden from public.warranty_sale_details where sa_number='SA100' order by uid;

\echo '--- 5. clearing the override puts the item back on the header ---'
update public.sale_items set warranty_end=null where uid='SA100|ORION-G|5289';
select uid, warranty_end, coalesce(array_length(overridden,1),0) as pinned
  from public.warranty_sale_details where sa_number='SA100' order by uid;

\echo '--- 6. a contract on one of those machines outranks its warranty ---'
insert into public.contract_entries
  (mc_number, party_name, contract_type, contract_start, contract_end, contract_years,
   contract_months, pm_visits_total, payment_schedule, bill_generate_at, status)
  values ('MC900','CITY HOSPITAL-1','CMC','2025-01-01','2030-12-31',1,12,3,'Yearly','Beginning Of Period','ACTIVE');
insert into public.contract_items (mc_number, product_code, product_name, serial_number, rate)
  values ('MC900','KB033600','MONNAL T75','430',40000);
select serial_number, warranty_end, contract_end, contract_state, item_status
  from public.machine_cover order by serial_number;
select serial_number, contract_number, contract_type, contract_end, item_status
  from public.products order by serial_number;

\echo '--- 7. cover_state buckets by the end date ---'
select public.cover_state(null) as none,
       public.cover_state(current_date - 1) as past,
       public.cover_state(current_date + 30) as soon,
       public.cover_state(current_date + 400) as active;

\echo '--- 8. an item whose header has not been imported yet gets a stub ---'
insert into public.contract_items (mc_number, product_name, serial_number) values ('MC999','HORUS','7777');
select mc_number, coalesce(party_name,'(stub)') as party from public.contract_entries where mc_number='MC999';
-- …and the real header, imported after it, fills the stub in rather than duplicating.
insert into public.contract_entries (mc_number, party_name, contract_end)
  values ('MC999','LATE HOSPITAL-9','2026-06-30')
  on conflict (mc_number) do update set party_name=excluded.party_name, contract_end=excluded.contract_end;
select count(*) as headers_for_mc999 from public.contract_entries where mc_number='MC999';
select uid, party_name, contract_end from public.contract_details where mc_number='MC999';

\echo '--- 9. UID is assigned from header|product|serial ---'
select uid from public.contract_items where mc_number='MC999';

\echo '--- 10. deleting a header takes its items with it ---'
delete from public.contract_entries where mc_number='MC999';
select count(*) as items_left from public.contract_items where mc_number='MC999';

\echo '--- 11. refresh_product_cover() re-syncs every machine after an import ---'
update public.products set item_status='OGP', contract_end=null;
select public.refresh_product_cover() as machines_synced;
select serial_number, item_status, contract_end from public.products order by serial_number;

\echo '--- 12. RLS: Commercial may write, an engineer may not (expect ERROR) ---'
-- The role switch has to happen inside a transaction and the owner (postgres)
-- bypasses RLS, so each assertion runs as `authenticated` in its own block.
-- Who is signed in is set BEFORE the switch: the harness reads auth.users,
-- which `authenticated` may not.
-- the stub's "session" table is owner-only by default; auth.uid() reads it.
grant select on public.harness to authenticated;
call public.be('comm@x.com');
begin;
  set local role authenticated;
  insert into public.sale_entries (sa_number, party_name) values ('SA200','ANOTHER HOSPITAL-2');
  select sa_number, party_name from public.sale_entries where sa_number='SA200';
commit;

call public.be('eng@x.com');
begin;
  set local role authenticated;
  insert into public.sale_entries (sa_number, party_name) values ('SA300','NOT ALLOWED');  -- expect ERROR
rollback;

\echo '--- 13. …and an engineer cannot rewrite one either (0 rows changed) ---'
begin;
  set local role authenticated;
  update public.sale_entries set party_name='HIJACKED' where sa_number='SA200';
commit;
select sa_number, party_name from public.sale_entries where sa_number='SA200';
