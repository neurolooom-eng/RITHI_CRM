-- ===========================================================================
-- REVIEW BATCH 11, PROVED ON A DATABASE (0455, 0456).
-- Each section proves BOTH halves: the hole the review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-071  a re-loaded MRN line takes the file's values -- one row, not two
--             -- by an importer only, and only an IMPORTED return (0455)
--   2. D-071  the same for a stock transfer line on an imported transfer (0455)
--   3. D-071  Normalise cover says what it would hand back, counts only what
--             it changed, and is refused to somebody who may not edit cover (0456)
--
-- The user's decision, 2026-10-12: "Overwrite with the file".
-- SUPERSEDED IN PART BY 0462 (D-177, the user's decision of 2026-10-14:
-- "Replace the whole SI / transfer"): a re-load now goes through
-- reload_imported_stock_lines(), proved in review_batch_12_test section 6. The
-- line-by-line upsert sections 1 and 2 relied on is REFUSED since then (0462
-- dropped its UPDATE policies), so here they prove that it is refused and that
-- it changes nothing -- not that it overwrites.
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb11_imp',  'RB11 Importer', '["bulk.upload", "stock.return", "stock.return.others", "stock.transfer", "stock.transfer.others"]'::jsonb),
 ('rb11_ret',  'RB11 Returns',  '["stock.return", "stock.return.others", "stock.transfer", "stock.transfer.others"]'::jsonb),
 ('rb11_cov',  'RB11 Cover',    '["cover.edit.entries"]'::jsonb),
 ('rb11_none', 'RB11 Nothing',  '["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id, email) values
  ('0bb10000-0000-0000-0000-000000000001', 'rb11-imp@x.com'),
  ('0bb10000-0000-0000-0000-000000000002', 'rb11-ret@x.com'),
  ('0bb10000-0000-0000-0000-000000000003', 'rb11-cov@x.com'),
  ('0bb10000-0000-0000-0000-000000000004', 'rb11-none@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0bb10000-0000-0000-0000-000000000001', 'rb11-imp@x.com',  'RB11 Imp',  'rb11_imp'),
  ('0bb10000-0000-0000-0000-000000000002', 'rb11-ret@x.com',  'RB11 Ret',  'rb11_ret'),
  ('0bb10000-0000-0000-0000-000000000003', 'rb11-cov@x.com',  'RB11 Cov',  'rb11_cov'),
  ('0bb10000-0000-0000-0000-000000000004', 'rb11-none@x.com', 'RB11 None', 'rb11_none')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-071: a re-loaded MRN line is overwritten, not added ---'
-- ===========================================================================
call public.nobody();
delete from public.material_returns where uid in ('RB11-SI1', 'RB11-APP1');
-- A return raised in the app, which nothing here may overwrite. Its stock
-- check is lifted by name for the fixture: what it returns is not the point.
alter table public.material_returns disable trigger material_returns_check_stock;
insert into public.material_returns (uid, row_no, part, engineer, good_qty, mrn_date, source)
values ('RB11-APP1', 1, 'RB11-P1|SENSOR', 'RB11 ENG', 1, current_date, 'app');
alter table public.material_returns enable trigger material_returns_check_stock;

create temp table rb11_n (what text, n bigint);
grant all on rb11_n to authenticated;
call public.be('rb11-imp@x.com');
set role authenticated;
-- The first load, as the MRN Register upload sends it.
insert into public.material_returns (uid, row_no, part, engineer, good_qty, mrn_date, source)
values ('RB11-SI1', 1, 'RB11-P1|SENSOR', 'RB11 ENG', 1, '2026-01-10', 'import'),
       ('RB11-SI1', 2, 'RB11-P2|VALVE',  'RB11 ENG', 1, '2026-01-10', 'import')
on conflict (uid, part_key, row_no) do update set good_qty = excluded.good_qty, engineer = excluded.engineer;
-- The same file again, corrected, sent line by line as 0455 did: since 0462
-- this is refused whole (a re-load replaces the SI Number through
-- reload_imported_stock_lines instead), and nothing changes.
\echo 'expect ERROR: new row violates row-level security policy (USING expression) for table "material_returns" (0462: no line-by-line re-load)'
insert into public.material_returns (uid, row_no, part, engineer, good_qty, mrn_date, source)
values ('RB11-SI1', 1, 'rb11-p1|Sensor (corrected)', 'RB11 ENG', 3, '2026-01-10', 'import'),
       ('RB11-SI1', 2, 'RB11-P2|VALVE',  'RB11 ENG', 1, '2026-01-10', 'import')
on conflict (uid, part_key, row_no) do update set good_qty = excluded.good_qty, part = excluded.part;
-- A return raised in the app is not the importer's to overwrite: the UPDATE
-- policy does not reach it, so nothing matches -- measured, since a refused
-- update raises no error (finding 48).
with u as (update public.material_returns set source = 'import', good_qty = 9 where uid = 'RB11-APP1' returning 1)
insert into rb11_n select 'importer on an app return', count(*) from u;
reset role;

-- Somebody who may raise returns but is no importer cannot overwrite one.
call public.be('rb11-ret@x.com');
set role authenticated;
with u as (update public.material_returns set good_qty = 7 where uid = 'RB11-SI1' and row_no = 1 returning 1)
insert into rb11_n select 'returns-role update', count(*) from u;
reset role;
call public.nobody();

do $$ begin
  if (select count(*) from public.material_returns where uid = 'RB11-SI1') <> 2 then
    raise exception 'D-071 FAILED: a re-loaded MRN file left % rows on RB11-SI1, want 2',
      (select count(*) from public.material_returns where uid = 'RB11-SI1');
  end if;
  if (select good_qty from public.material_returns where uid = 'RB11-SI1' and row_no = 1) <> 1 then
    raise exception 'D-177 FAILED: a refused line-by-line re-load changed the return';
  end if;
  if (select n from rb11_n where what = 'importer on an app return') <> 0 then
    raise exception 'D-071 FAILED: an importer reached a return raised in the app';
  end if;
  if (select n from rb11_n where what = 'returns-role update') <> 0 then
    raise exception 'D-071 FAILED: somebody who is not an importer overwrote an imported return';
  end if;
  if (select good_qty from public.material_returns where uid = 'RB11-APP1') <> 1
     or (select source from public.material_returns where uid = 'RB11-APP1') <> 'app' then
    raise exception 'D-071 FAILED: a return raised in the app was overwritten';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'material_returns' and op = 'INSERT'
                  and new_data->>'uid' = 'RB11-SI1') then
    raise exception 'D-071 FAILED: the loaded returns were not imaged';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-071: a re-loaded stock transfer line is overwritten, not added ---'
-- ===========================================================================
call public.nobody();
delete from public.stock_transfers where uid in ('RB11-ST1', 'RB11-ST2');
-- A transfer raised in the app, with one line (its stock check lifted by name
-- for the fixture).
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date, source) values
  ('RB11-ST2', 'RB11 A', 'RB11 B', '2026-01-10', '');
alter table public.stock_transfer_lines disable trigger stock_transfer_lines_check_stock;
insert into public.stock_transfer_lines (transfer_uid, row_no, part, qty) values ('RB11-ST2', 1, 'RB11-P1|SENSOR', 1);
alter table public.stock_transfer_lines enable trigger stock_transfer_lines_check_stock;

call public.be('rb11-imp@x.com');
set role authenticated;
-- The Stock Transfer Register upload, then the lines: both as the importer.
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date, source)
values ('RB11-ST1', 'RB11 A', 'RB11 B', '2026-01-10', 'import');
insert into public.stock_transfer_lines (transfer_uid, row_no, part, qty) values
  ('RB11-ST1', 1, 'RB11-P1|SENSOR', 1), ('RB11-ST1', 2, 'RB11-P2|VALVE', 2)
on conflict (transfer_uid, row_no) do update set part = excluded.part, qty = excluded.qty;
\echo 'expect ERROR: new row violates row-level security policy (USING expression) for table "stock_transfer_lines" (0462: no line-by-line re-load)'
insert into public.stock_transfer_lines (transfer_uid, row_no, part, qty) values
  ('RB11-ST1', 1, 'RB11-P1|SENSOR', 4), ('RB11-ST1', 2, 'RB11-P2|VALVE', 2)
on conflict (transfer_uid, row_no) do update set part = excluded.part, qty = excluded.qty;
-- A line of a transfer raised in the app is not the importer's to overwrite.
with u as (update public.stock_transfer_lines set qty = 9 where transfer_uid = 'RB11-ST2' returning 1)
insert into rb11_n select 'importer on an app transfer', count(*) from u;
reset role;
call public.nobody();

do $$ begin
  if (select string_agg(row_no || ':' || qty, ',' order by row_no) from public.stock_transfer_lines where transfer_uid = 'RB11-ST1')
     is distinct from '1:1,2:2' then
    raise exception 'D-177 FAILED: a refused line-by-line re-load left %',
      (select string_agg(row_no || ':' || qty, ',' order by row_no) from public.stock_transfer_lines where transfer_uid = 'RB11-ST1');
  end if;
  if (select n from rb11_n where what = 'importer on an app transfer') <> 0 then
    raise exception 'D-071 FAILED: an importer overwrote a line of a transfer raised in the app';
  end if;
end $$;
\echo 'expect ERROR: duplicate key value violates unique constraint "stock_transfer_lines_natural_key" (a line number is one line)'
insert into public.stock_transfer_lines (transfer_uid, row_no, part, qty) values ('RB11-ST2', 1, 'RB11-P2|VALVE', 1);

-- ===========================================================================
\echo ''
\echo '--- 3. D-071: Normalise cover says first, and counts what it changed ---'
-- ===========================================================================
call public.nobody();
delete from public.sale_items where sa_number = 'SA-RB11';
delete from public.sale_entries where sa_number = 'SA-RB11';
insert into public.sale_entries (sa_number, party_name, invoice_no, state)
values ('SA-RB11', 'RB11 HOSP', 'INV-RB11', 'KARNATAKA');
-- Line 1 repeats the entry's invoice and state; line 2 holds its own invoice;
-- line 3 already follows the entry.
insert into public.sale_items (sa_number, product_code, product_name, serial_number, invoice_no, state) values
  ('SA-RB11', 'RB11', 'RB11 VENT', 'RB11-S1', 'INV-RB11', 'KARNATAKA'),
  ('SA-RB11', 'RB11', 'RB11 VENT', 'RB11-S2', 'INV-OWN',  null),
  ('SA-RB11', 'RB11', 'RB11 VENT', 'RB11-S3', null,       null);

call public.be('rb11-none@x.com');
set role authenticated;
\echo 'expect ERROR: Only someone who may edit cover (cover.edit) can re-fold cover after an import.'
select * from public.cover_unpin_preview();
reset role;

call public.be('rb11-cov@x.com');
set role authenticated;
create temp table rb11_prev as select * from public.cover_unpin_preview() where register = 'Warranty';
grant all on rb11_prev to authenticated;
insert into rb11_n select 'unpinned', public.cover_unpin_inherited();
insert into rb11_n select 'unpinned again', public.cover_unpin_inherited();
reset role;
call public.nobody();

do $$ begin
  if (select string_agg(field || '=' || n, ',' order by field) from rb11_prev where field in ('invoice_no', 'state'))
     is distinct from 'invoice_no=1,state=1' then
    raise exception 'D-071 FAILED: the preview counted %', (select string_agg(field || '=' || n, ',' order by field) from rb11_prev);
  end if;
  if (select n from rb11_n where what = 'unpinned') < 1
     or (select n from rb11_n where what = 'unpinned again') <> 0 then
    raise exception 'D-071 FAILED: Normalise counted % then % -- the second run changes nothing and must say 0',
      (select n from rb11_n where what = 'unpinned'), (select n from rb11_n where what = 'unpinned again');
  end if;
  if (select invoice_no from public.sale_items where serial_number = 'RB11-S1') is not null
     or (select invoice_no from public.sale_items where serial_number = 'RB11-S2') <> 'INV-OWN' then
    raise exception 'D-071 FAILED: Normalise handed back the wrong values';
  end if;
end $$;
delete from public.sale_items where sa_number = 'SA-RB11';
delete from public.sale_entries where sa_number = 'SA-RB11';

call public.nobody();
