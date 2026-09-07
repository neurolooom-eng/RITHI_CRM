-- ===========================================================================
-- ONE MACHINE BY ITS SERIAL IS AN EQUALITY (0129).
--
-- "Could not prepare registration: canceling statement due to statement
-- timeout" on Pending Registrations, reported 2026-09-07 and not for the first
-- time. Registering a call from a request validated the machine by asking for
-- `serial_number ILIKE '%5054%'` and then finding the exact row in the browser.
--
-- What this suite is really holding:
--   * `serial_key` is GENERATED, so it cannot drift from serial_number and
--     nobody can write it by hand;
--   * it normalises case and surrounding space, so a serial matches however it
--     was typed;
--   * an equality on it uses the INDEX, and the old substring does not — the
--     trigram index cannot serve a 4-character pattern, which is why the
--     planner scanned and the statement timed out;
--   * the substring genuinely matched OTHER machines, which is the correctness
--     half: the old code read 25 of them and could miss the one it wanted.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.products where party_name like 'PSK %';
insert into public.products (item_name, serial_number, party_name) values
 ('MONNAL T75', '5054',   'PSK ONE'),
 ('MONNAL T75', '15054',  'PSK TWO'),      -- CONTAINS 5054
 ('MONNAL T75', '25054',  'PSK THREE'),    -- CONTAINS 5054
 ('MONNAL T60', '  A-77 ','PSK SPACED'),   -- padded and upper-case
 ('MONNAL T60', '',       'PSK BLANK');

\echo '--- 1. serial_key is GENERATED — it cannot drift, and cannot be written ---'
\echo 'expect: ALWAYS'
select is_generated from information_schema.columns
 where table_schema='public' and table_name='products' and column_name='serial_key';

\echo 'expect ERROR: cannot insert a non-DEFAULT value into column "serial_key"'
insert into public.products (item_name, serial_number, party_name, serial_key)
values ('MONNAL T75','9999','PSK FORGED','something else');

\echo '--- 2. it normalises case and surrounding space ---'
\echo 'expect: "  A-77 " -> a-77, and a blank serial -> empty (not null)'
select party_name, '[' || serial_number || ']' as raw, '[' || serial_key || ']' as key
  from public.products where party_name in ('PSK SPACED','PSK BLANK') order by 1;

\echo '--- 3. the equality finds exactly ONE machine ---'
\echo 'expect: 1 row, PSK ONE'
select party_name from public.products where serial_key = '5054';

\echo '--- 4. ...and the old substring found THREE ---'
\echo 'expect: 3 — this is the correctness half, not just the speed one. The'
\echo 'expect: old code read the first 25 of these and hunted for the exact one'
\echo 'expect: in the browser, so a serial contained by 25 others was never found'
select count(*) as substring_matches from public.products where serial_number ilike '%5054%';

\echo '--- 5. the index exists, and is the partial one that skips blank serials ---'
\echo 'expect: one row, with WHERE (serial_key <> '''')'
select indexdef from pg_indexes
 where schemaname='public' and tablename='products' and indexname='products_serial_key_col_idx';

\echo '--- 6. 0037''s EXPRESSION index is still there — sync_product_cover joins on it ---'
\echo 'expect: one row. The new column does not replace it; PostgREST simply'
\echo 'expect: cannot express lower(trim(serial_number)) in a filter, which is'
\echo 'expect: why a client could never reach it'
select count(*) as expression_index from pg_indexes
 where schemaname='public' and tablename='products' and indexname='products_serial_key_idx';
