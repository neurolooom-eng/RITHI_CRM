-- ===========================================================================
-- 0317 — the one-time "Update from Party Master" + "Force Update Child
-- Records" across every Warranty Sale Entry.
--   1. A sale whose party the master holds takes all eleven fields from it,
--      BLANKS INCLUDED (the user's choice, 2026-10-02), and the old values are
--      kept in sale_party_refresh_backup.
--   2. A sale whose party the master does not hold is left exactly alone.
--   3. A sale already matching the master is not written (no backup row).
--   4. Every machine's pinned values are cleared, and kept in
--      sale_items_inherit_backup; a machine with none is not touched.
--   5. Run again, nothing changes: the marker row stops it.
-- Any wrong answer is an ERROR not labelled `expect ERROR`.
-- Run after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- The migration has already run on this database (empty); un-mark it so the
-- fixtures below are what it works on.
delete from public.one_time_fixes_done where name = '0317_warranty_party_refresh';

insert into public.parties (party_name, state, city, address, pincode, phone, phone_2, pan, gstin,
                            party_type, profile, service_engineer)
values ('PR HOSPITAL', 'Kerala', 'Kochi', 'New Road 1', '682001', '111', '', 'PAN1', 'GST1',
        'customer', 'Private', 'ENG NEW'),
       ('PR SAME', 'Goa', 'Panaji', 'Same St', '403001', '222', '', '', '', '', '', '');

insert into public.sale_entries (sa_number, party_name, state, city, address, pincode, tel1, tel2, pan, gst,
                                 party_type, profile, engineer, warranty_start, warranty_end)
values ('SA-PR-1', 'pr hospital ', 'Old', 'Old', 'Old address', '000', '999', 'TEL2 TYPED', '', '',
        'DEALER', 'GOVERNMENT', 'ENG OLD', '2025-01-01', '2026-12-31'),
       ('SA-PR-2', 'NOT IN MASTER', 'Keep', 'Keep', 'Keep', 'Keep', 'Keep', 'Keep', 'Keep', 'Keep',
        'CUSTOMER', 'PRIVATE', 'Keep', '2025-01-01', '2026-12-31'),
       ('SA-PR-3', 'PR SAME', 'Goa', 'Panaji', 'Same St', '403001', '222', '', '', '', '', '', '',
        '2025-01-01', '2026-12-31');
insert into public.sale_items (sa_number, product_code, product_name, serial_number, warranty_end, city, engineer)
values ('SA-PR-1', 'VEGA', 'VEGA', 'PR1', '2030-01-01', 'Pinned city', 'Pinned eng'),
       ('SA-PR-1', 'VEGA', 'VEGA', 'PR2', null, null, null);

\i supabase/migrations/0317_warranty_party_refresh_once.sql

\echo '--- 1. the matched sale takes all eleven from the master, blanks included ---'
do $$ declare s record; begin
  select * into s from public.sale_entries where sa_number = 'SA-PR-1';
  if (s.state, s.city, s.address, s.pincode, s.tel1, s.tel2, s.pan, s.gst, s.party_type, s.profile, s.engineer)
     is distinct from ('Kerala', 'Kochi', 'New Road 1', '682001', '111', '', 'PAN1', 'GST1', 'CUSTOMER', 'PRIVATE', 'ENG NEW')
  then raise exception 'FAILED 1: SA-PR-1 reads %', row_to_json(s); end if;
  if not exists (select 1 from public.sale_party_refresh_backup
                  where sa_number = 'SA-PR-1' and before->>'tel2' = 'TEL2 TYPED' and after->>'tel2' = '')
  then raise exception 'FAILED 1: the blanked Tel 2 is not in the backup'; end if;
  raise notice 'ok 1';
end $$;

\echo '--- 2. a party the master does not hold is left alone ---'
do $$ begin
  if exists (select 1 from public.sale_entries where sa_number = 'SA-PR-2' and city <> 'Keep')
     or exists (select 1 from public.sale_party_refresh_backup where sa_number = 'SA-PR-2')
  then raise exception 'FAILED 2: SA-PR-2 was touched'; end if;
  raise notice 'ok 2';
end $$;

\echo '--- 3. a sale already matching the master is not written ---'
do $$ begin
  if exists (select 1 from public.sale_party_refresh_backup where sa_number = 'SA-PR-3')
  then raise exception 'FAILED 3: SA-PR-3 was written although nothing differed'; end if;
  raise notice 'ok 3';
end $$;

\echo '--- 4. pinned machine values are cleared and backed up; an unpinned machine is untouched ---'
do $$ begin
  if exists (select 1 from public.sale_items where sa_number = 'SA-PR-1'
              and coalesce(warranty_end::text, city, engineer) is not null)
  then raise exception 'FAILED 4: a machine still holds a pinned value'; end if;
  if not exists (select 1 from public.sale_items_inherit_backup
                  where serial_number = 'PR1' and before->>'city' = 'Pinned city' and before->>'warranty_end' = '2030-01-01')
  then raise exception 'FAILED 4: PR1''s pinned values are not in the backup'; end if;
  if exists (select 1 from public.sale_items_inherit_backup where serial_number = 'PR2')
  then raise exception 'FAILED 4: PR2 had nothing pinned and was backed up anyway'; end if;
  -- The machine now reads its sale's (refreshed) values through the view.
  if not exists (select 1 from public.warranty_sale_details
                  where serial_number = 'PR1' and city = 'Kochi' and engineer = 'ENG NEW' and warranty_end = '2026-12-31')
  then raise exception 'FAILED 4: PR1 does not follow its sale'; end if;
  raise notice 'ok 4';
end $$;

\echo '--- 5. once: a second run touches nothing ---'
update public.sale_entries set city = 'Typed after' where sa_number = 'SA-PR-1';
update public.sale_items set city = 'Pinned after' where serial_number = 'PR2';
\i supabase/migrations/0317_warranty_party_refresh_once.sql
do $$ begin
  if not exists (select 1 from public.sale_entries where sa_number = 'SA-PR-1' and city = 'Typed after')
     or not exists (select 1 from public.sale_items where serial_number = 'PR2' and city = 'Pinned after')
  then raise exception 'FAILED 5: the second run changed something'; end if;
  if (select count(*) from public.one_time_fixes_done where name = '0317_warranty_party_refresh') <> 1
  then raise exception 'FAILED 5: the marker is not exactly one row'; end if;
  raise notice 'ok 5';
end $$;

\echo '--- 6. nobody signed in can read the backups or the marker ---'
do $$ begin
  if has_table_privilege('authenticated', 'public.sale_party_refresh_backup', 'SELECT')
     or has_table_privilege('anon', 'public.sale_items_inherit_backup', 'SELECT')
     or has_table_privilege('authenticated', 'public.one_time_fixes_done', 'INSERT')
  then raise exception 'FAILED 6: a backup or the marker is reachable through the API'; end if;
  raise notice 'ok 6';
end $$;
