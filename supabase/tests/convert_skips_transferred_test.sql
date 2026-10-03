-- ===========================================================================
-- CONVERTING A SALE INTO A CONTRACT NEVER OFFERS A MACHINE NOW WITH ANOTHER
-- CUSTOMER (the user, 2026-10-03: "if the product is not with that user never
-- given that product in the list of the Contract.. and add a statement -
-- Product serial number was transferred to a different customer").
--
-- The screen asks machine_current_party() (0238, 0240) for every machine on
-- the sale, as the signed-in user, and compares the answer with the sale's
-- buyer (withAnotherCustomer in coverspec.ts, check:cover-party). This suite
-- proves the database half AS THAT USER: the function names the new owner of
-- a transferred machine, the buyer for one still with them, and the buyer
-- again once a later sale brings the machine back.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('cv_cover', 'CV Cover desk', '["cover.edit.entries", "contract.edit.entries", "masters.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0c770000-0000-0000-0000-000000000001', 'cv-desk@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0c770000-0000-0000-0000-000000000001', 'cv-desk@x.com', 'CV Desk', 'cv_cover')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.sale_entries (sa_number, party_name, entry_at) values
  ('SA-CV1', 'CITY HOSPITAL', '2025-01-10 10:00+05:30'),
  ('SA-CV2', 'CITY HOSPITAL', '2026-06-01 10:00+05:30');
insert into public.sale_items (uid, sa_number, product_name, serial_number) values
  ('CV-U1', 'SA-CV1', 'ORION', 'CV-1'),
  ('CV-U2', 'SA-CV1', 'ORION', 'CV-2'),
  ('CV-U3', 'SA-CV1', 'ORION', 'CV-3'),
  -- CV-3 is sold again to the same buyer AFTER it was transferred away
  ('CV-U4', 'SA-CV2', 'ORION', 'CV-3');
insert into public.ownership_transfers (serial_number, item_name, from_party, to_party, transfer_date, transferred_at) values
  ('CV-2', 'ORION', 'CITY HOSPITAL', 'METRO CLINIC', '2025-08-01', '2025-08-01 12:00+05:30'),
  ('CV-3', 'ORION', 'CITY HOSPITAL', 'METRO CLINIC', '2025-08-01', '2025-08-01 12:00+05:30');

\echo ''
\echo '--- 1. As the cover desk: who has each machine of SA-CV1 now ---'
call public.be('cv-desk@x.com');
begin; set local role authenticated;
  select serial_number,
         public.machine_current_party(product_name, serial_number) as with_now,
         coalesce(public.machine_current_party(product_name, serial_number), '') <> 'CITY HOSPITAL' as not_offered
    from public.sale_items where sa_number = 'SA-CV1' order by serial_number;
commit;
\echo 'expected: CV-1 CITY HOSPITAL f · CV-2 METRO CLINIC t · CV-3 CITY HOSPITAL f (the later sale brought it back)'

\echo ''
\echo '--- 2. The answer does not depend on who asks: the function runs as the caller and reads the transfer register every signed-in user may read ---'
call public.be('cv-desk@x.com');
begin; set local role authenticated;
  select count(*) as transfers_visible from public.ownership_transfers where serial_number like 'CV-%';
commit;
\echo 'expected: 2'
