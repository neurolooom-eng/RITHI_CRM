-- ===========================================================================
-- LABOUR CHARGES: BOOKED ON A CONSUMPTION, NEVER HELD AS STOCK (0413, D-163).
--
--   1. the Part Master flag, and the three codes ticked once
--   2. a labour consumption of 1 is BOOKED, as a signed-in engineer, with no
--      hand stock behind it, and nobody is told the stock went negative
--   3. it has no hand stock line and no movement; the consumption row stays
--   4. any other quantity is refused; a saved line may be voided to 0, not 2
--   5. an ordinary part is untouched: still counted, still notified
--   6. a re-run does not re-tick a part the Part Master unticked
--   7. a labour charge is not requested as a spare (0414): refused for a
--      signed-in engineer, new or re-pointed; an ordinary part is not; an
--      import (no signed-in user) is let through
--
-- The bookings run as `authenticated`. Run ONCE after _stub.sql + every
-- migration. Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e413000-0000-0000-0000-000000000001', 'lab-eng@x.com'),
  ('0e413000-0000-0000-0000-000000000002', 'lab-coord@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, active) values
  ('0e413000-0000-0000-0000-000000000001', 'lab-eng@x.com',   'LAB ENG',   'engineer',          true),
  ('0e413000-0000-0000-0000-000000000002', 'lab-coord@x.com', 'LAB COORD', 'spare_coordinator', true)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = excluded.active;
insert into public.user_directory (name, email) values ('LAB ENG', 'lab-eng@x.com');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

call public.nobody();
-- The fixture is created AFTER the migration, so tick the test parts here, as
-- the Part Master would.
insert into public.parts (code, item_detail, labour_charge) values
  ('SC-T413', 'SC-T413|SERVICE CHARGES TEST', true),
  ('LAB-P1',  'LAB-P1|ORDINARY PART', false)
on conflict do nothing;
insert into public.field_calls (ucn, call_number, party_name, allocated_to, last_status, last_visit_at, item_status) values
  ('LAB-C1', 'CN-LAB1', 'LAB HOSP', 'LAB ENG', 'Solved', now(), 'AMC');
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
  ('LAB-V1', 'LAB-C1', 'Solved - Report Completed', '{}'::jsonb, now(), now());

\echo ''
\echo '--- 1. the flag ---'
select 'the flag' as t,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'parts' and column_name = 'labour_charge') as column_exists,
  'SC-T413' = any (public.labour_part_codes()) as test_part_is_labour,
  not ('LAB-P1' = any (public.labour_part_codes())) as ordinary_part_is_not;

\echo ''
\echo '--- 2. booked with no stock, nobody told ---'
call public.be('lab-eng@x.com');
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('LAB-C1', 'CN-LAB1', 'SC-T413|SERVICE CHARGES TEST', 1, 'LAB ENG', 'lab-eng@x.com');
commit;
reset role;
select 'booked' as t,
  (select count(*) = 1 from public.spare_consumption where ucn = 'LAB-C1' and part_code(part) = 'SC-T413') as booked,
  (select count(*) = 0 from public.notifications where kind = 'negative_handstock' and body like '%SC-T413%') as nobody_told;

\echo ''
\echo '--- 3. no hand stock ---'
select 'no hand stock' as t,
  not exists (select 1 from public.handstock_balance where part_code = 'SC-T413') as no_balance_line,
  not exists (select 1 from public.handstock_movements where part_code = 'SC-T413') as no_movement,
  public.engineer_stock_available('LAB ENG', 'SC-T413|SERVICE CHARGES TEST') = 0 as available_reads_0;

\echo ''
\echo '--- 4. quantity 1 ---'
call public.be('lab-eng@x.com');
\echo 'expect ERROR: SC-T413 is a labour charge: it is booked once, quantity 1'
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('LAB-C1', 'CN-LAB1', 'SC-T413|SERVICE CHARGES TEST', 2, 'LAB ENG', 'lab-eng@x.com');
commit;
reset role;
call public.be('lab-coord@x.com');
\echo 'expect ERROR: SC-T413 is a labour charge: its quantity is 1, or 0 to void the line'
update public.spare_consumption set qty = 2, adjustment_reason = 'x' where ucn = 'LAB-C1' and part_code(part) = 'SC-T413';
update public.spare_consumption set qty = 0, adjustment_reason = 'booked by mistake' where ucn = 'LAB-C1' and part_code(part) = 'SC-T413';
select 'void' as t,
  (select qty = 0 from public.spare_consumption where ucn = 'LAB-C1' and part_code(part) = 'SC-T413') as voided_to_0;

\echo ''
\echo '--- 5. an ordinary part is untouched ---'
call public.be('lab-eng@x.com');
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('LAB-C1', 'CN-LAB1', 'LAB-P1|ORDINARY PART', 2, 'LAB ENG', 'lab-eng@x.com');
commit;
reset role;
select 'ordinary' as t,
  (select on_hand = -2 from public.handstock_balance where engineer_key = public.handstock_key('LAB ENG') and part_code = 'LAB-P1') as counted,
  (select count(*) = 1 from public.notifications where kind = 'negative_handstock' and body like '%LAB-P1%') as coordinator_told;

\echo ''
\echo '--- 6. a re-run does not re-tick ---'
call public.nobody();
insert into public.parts (code, item_detail) values ('TC001', 'TC001|TRANSPORTATION CHARGES') on conflict do nothing;
update public.parts set labour_charge = false where code = 'TC001';
\i supabase/migrations/0413_labour_charges.sql
select 're-run' as t,
  (select not labour_charge from public.parts where code = 'TC001') as unticked_stays_unticked;
select 'grants' as t,
  not has_function_privilege('anon', 'public.labour_part_codes()', 'EXECUTE') as public_key_may_not_call,
  has_function_privilege('authenticated', 'public.labour_part_codes()', 'EXECUTE') as signed_in_may_call;

\echo ''
\echo '--- 7. not requested as a spare (0414) ---'
call public.nobody();
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn)
values ('LAB-SR1', 'Call Based', 'LAB ENG', 'lab-eng@x.com', 'AMC', 'LAB-C1');
call public.be('lab-eng@x.com');
\echo 'expect ERROR: SC-T413 is a labour charge -- add it to the consumption on the visit, it is not requested as a spare'
insert into public.spare_request_lines (request_uid, part, qty, row_no) values ('LAB-SR1', 'SC-T413|SERVICE CHARGES TEST', 1, 1);
insert into public.spare_request_lines (request_uid, part, qty, row_no) values ('LAB-SR1', 'LAB-P1|ORDINARY PART', 1, 2);
\echo 'expect ERROR: SC-T413 is a labour charge (re-pointing a line at one)'
update public.spare_request_lines set part = 'SC-T413|SERVICE CHARGES TEST' where request_uid = 'LAB-SR1' and row_no = 2;
call public.nobody();
insert into public.spare_request_lines (request_uid, part, qty, row_no) values ('LAB-SR1', 'SC-T413|SERVICE CHARGES TEST', 1, 3);
select 'not requested' as t,
  (select count(*) = 1 from public.spare_request_lines where request_uid = 'LAB-SR1' and part_code(part) = 'LAB-P1') as ordinary_part_requested,
  (select count(*) = 1 from public.spare_request_lines where request_uid = 'LAB-SR1' and part_code(part) = 'SC-T413' and row_no = 3) as import_let_through,
  (select count(*) = 1 from public.spare_request_lines where request_uid = 'LAB-SR1' and part_code(part) = 'SC-T413') as engineer_line_refused;
