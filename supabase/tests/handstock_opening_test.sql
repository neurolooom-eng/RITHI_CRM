-- ===========================================================================
-- Opening stock (0074) — the hand stock that pre-dates the movement history.
--
-- Raw spare data starts June 2022. What an engineer held before that (WinMax
-- HS) and the per-period pools alongside it (22 H2, 23, 24, 25) exist only as
-- balances. Because consumption is CAPPED at hand stock (0061), without them an
-- engineer cannot report fitting a part they are genuinely carrying.
--
-- What has to hold: the pools are ADDITIVE (they sit alongside each other and
-- alongside the movements, and nothing is double-counted because there are no
-- movements before June 2022); re-loading a corrected pool REPLACES that pool
-- rather than adding a second; and the opening flows through to the cap and to
-- `engineer_stock`, which the transfer guard reads — the two cannot disagree.
--
-- Run after _stub.sql + every migration:
--   psql ... -f supabase/tests/handstock_opening_test.sql
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values ('d1d1d1d1-0000-0000-0000-000000000001','hso@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('d1d1d1d1-0000-0000-0000-000000000001','hso@x.com','HSO Coord','admin')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
call public.be('hso@x.com');

\echo '--- 1. with no opening, the engineer holds nothing (expect ERROR: the cap) ---'
insert into public.spare_consumption (ucn, part, qty, engineer)
  values ('HSO-U1','HSO-1|Legacy valve', 2, 'HSO Engineer');

\echo '--- 2. the WinMax pool, struck as the opening balance in June 2022 ---'
insert into public.handstock_opening (engineer, part, qty, as_of, source)
  values ('HSO Engineer','HSO-1|Legacy valve', 5, '2022-06-01', 'WinMax HS');
select engineer, part_code, opening, on_hand from public.handstock_balance where part_code = 'HSO-1';

\echo '--- 3. the yearly pools sit ALONGSIDE it, not instead of it ---'
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
  ('HSO Engineer','HSO-1|Legacy valve', 3, '2022-12-31', '22 H2'),
  ('HSO Engineer','HSO-1|Legacy valve', 2, '2023-12-31', '23');
\echo 'expect: opening 10 (5 + 3 + 2)'
select opening, on_hand from public.handstock_balance where part_code = 'HSO-1';

\echo '--- 4. re-loading a corrected pool REPLACES that pool, never doubles it ---'
insert into public.handstock_opening (engineer, part, qty, as_of, source)
  values ('HSO Engineer','HSO-1|Legacy valve', 9, '2022-06-01', 'WinMax HS')
on conflict (engineer_key, part_code, source_key) do update set qty = excluded.qty;
\echo 'expect: opening 14 (9 + 3 + 2) — NOT 19'
select opening, on_hand from public.handstock_balance where part_code = 'HSO-1';

\echo '--- 5. the same source in different case is the SAME pool ---'
insert into public.handstock_opening (engineer, part, qty, as_of, source)
  values ('HSO Engineer','HSO-1|Legacy valve', 1, '2022-06-01', '  winmax hs ')
on conflict (engineer_key, part_code, source_key) do update set qty = excluded.qty;
\echo 'expect: opening 6 (1 + 3 + 2) — the WinMax pool was corrected, not added to'
select opening, on_hand from public.handstock_balance where part_code = 'HSO-1';

\echo '--- 6. opening stock is CONSUMABLE — the point of the whole thing ---'
insert into public.spare_consumption (ucn, part, qty, engineer)
  values ('HSO-U1','HSO-1|Legacy valve', 4, 'HSO Engineer');
select opening, consumed, on_hand from public.handstock_balance where part_code = 'HSO-1';

\echo '--- 7. ...and still capped at what is actually held (expect ERROR) ---'
insert into public.spare_consumption (ucn, part, qty, engineer)
  values ('HSO-U1','HSO-1|Legacy valve', 99, 'HSO Engineer');

\echo '--- 8. engineer_stock, which the TRANSFER guard reads, agrees ---'
\echo 'expect: the same 2 as on_hand above — the two derivations cannot disagree'
select engineer, part, qty from public.engineer_stock where part like 'HSO-1%';

\echo '--- 9. a pool needs its source; an unlabelled balance is unauditable (expect ERROR) ---'
insert into public.handstock_opening (engineer, part, qty, as_of, source)
  values ('HSO Engineer','HSO-2|Other', 1, '2022-06-01', '');

\echo '--- 10. and cannot be negative (expect ERROR) ---'
insert into public.handstock_opening (engineer, part, qty, as_of, source)
  values ('HSO Engineer','HSO-2|Other', -1, '2022-06-01', 'WinMax HS');

\echo '--- 11. cleanup ---'
delete from public.spare_consumption where ucn = 'HSO-U1';
delete from public.handstock_opening where part like 'HSO-%';
delete from public.profiles where email = 'hso@x.com';
