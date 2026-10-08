-- ===========================================================================
-- A SPARE CONSUMED BEYOND THE HAND STOCK IS BOOKED, AND THE SPARE COORDINATOR
-- IS TOLD (0401).
--
-- The user, 2026-10-08: "Allow even if it's negative but notify the Spare
-- Coordinator about the negative spare."
--
--   1. a visit line beyond the balance is BOOKED, the stock goes negative, and
--      every ACTIVE Spare Coordinator gets one notification -- nobody else
--   2. a line within the balance notifies nobody
--   3. raising a saved line past the balance is allowed and notified
--   4. the other rules still refuse: a zero quantity, and a transfer of stock
--      the sender does not hold (0339 is unchanged)
--
-- The bookings run as `authenticated`; a superuser ignores row-level security
-- and EXECUTE grants. Run ONCE after _stub.sql + every migration. Every error
-- printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e600000-0000-0000-0000-000000000001', 'neg-eng@x.com'),
  ('0e600000-0000-0000-0000-000000000002', 'neg-coord@x.com'),
  ('0e600000-0000-0000-0000-000000000003', 'neg-coord-off@x.com'),
  ('0e600000-0000-0000-0000-000000000004', 'neg-stores@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, active) values
  ('0e600000-0000-0000-0000-000000000001', 'neg-eng@x.com',       'NEG ENG',       'engineer',          true),
  ('0e600000-0000-0000-0000-000000000002', 'neg-coord@x.com',     'NEG COORD',     'spare_coordinator', true),
  ('0e600000-0000-0000-0000-000000000003', 'neg-coord-off@x.com', 'NEG COORD OFF', 'spare_coordinator', false),
  ('0e600000-0000-0000-0000-000000000004', 'neg-stores@x.com',    'NEG STORES',    'stores_incharge',   true)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = excluded.active;
insert into public.user_directory (name, email) values ('NEG ENG', 'neg-eng@x.com');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

call public.nobody();
insert into public.parts (code, item_detail) values ('NEG-1', 'NEG-1|NEG PART') on conflict do nothing;
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
  ('NEG ENG', 'NEG-1|NEG PART', 1, current_date, 'test');
insert into public.field_calls (ucn, call_number, party_name, allocated_to, last_status, last_visit_at, item_status) values
  ('NEG-C1', 'CN-NEG1', 'NEG HOSP', 'NEG ENG', 'Solved', now(), 'AMC');
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
  ('NEG-V1', 'NEG-C1', 'Solved - Report Completed', '{}'::jsonb, now(), now());

-- ===========================================================================
\echo ''
\echo '--- 1. beyond the balance: booked, negative, the active coordinator told ---'
call public.be('neg-eng@x.com');
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('NEG-C1', 'CN-NEG1', 'NEG-1|NEG PART', 3, 'NEG ENG', 'neg-eng@x.com');
commit;
reset role;
select 'beyond the balance' as check,
  (select count(*) from public.spare_consumption where ucn = 'NEG-C1' and qty = 3)::text as booked_should_be_1,
  (select on_hand::text from public.handstock_balance where engineer_key = 'neg eng' and part_code = 'NEG-1') as on_hand_should_be_minus_2,
  (select count(*) from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.kind = 'negative_handstock' and p.email = 'neg-coord@x.com')::text as coordinator_told_should_be_1,
  (select count(*) from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.kind = 'negative_handstock' and p.email in ('neg-coord-off@x.com', 'neg-stores@x.com', 'neg-eng@x.com'))::text as others_told_should_be_0,
  (select body from public.notifications n join public.profiles p on p.id = n.recipient_id
     where n.kind = 'negative_handstock' and p.email = 'neg-coord@x.com' limit 1) as body_names_engineer_part_numbers_ucn;

\echo ''
\echo '--- 2. the coordinator reads it on the bell; the engineer does not ---'
call public.be('neg-coord@x.com');
begin; set local role authenticated;
  select count(*)::text as coordinator_sees_should_be_1 from public.notifications where kind = 'negative_handstock';
commit;
call public.be('neg-eng@x.com');
begin; set local role authenticated;
  select count(*)::text as engineer_sees_should_be_0 from public.notifications where kind = 'negative_handstock';
commit;

\echo ''
\echo '--- 3. within the balance: nobody is told ---'
call public.nobody();
reset role;
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
  ('NEG ENG', 'NEG-1|NEG PART', 10, current_date, 'test top-up');
call public.be('neg-eng@x.com');
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('NEG-C1', 'CN-NEG1', 'NEG-1|NEG PART', 1, 'NEG ENG', 'neg-eng@x.com');
commit;
reset role;
select count(*)::text as still_1_notification from public.notifications where kind = 'negative_handstock';

\echo ''
\echo '--- 4. raising a saved line past the balance: allowed and told ---'
-- Balance is now 1 + 10 - 3 - 1 = 7; raising the line of 1 to 20 asks for 19.
call public.be('neg-coord@x.com');
update public.spare_consumption set qty = 20, adjustment_reason = 'counted again'
 where ucn = 'NEG-C1' and qty = 1;
select 'raise' as check,
  (select count(*) from public.spare_consumption where ucn = 'NEG-C1' and qty = 20)::text as raised_should_be_1,
  (select on_hand::text from public.handstock_balance where engineer_key = 'neg eng' and part_code = 'NEG-1') as on_hand_should_be_minus_12,
  (select count(*) from public.notifications where kind = 'negative_handstock')::text as notifications_should_be_2;

\echo ''
\echo '--- 5. the other rules still refuse ---'
call public.be('neg-eng@x.com');
\echo 'expect ERROR: Quantity must be more than zero'
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('NEG-C1', 'CN-NEG1', 'NEG-1|NEG PART', 0, 'NEG ENG', 'neg-eng@x.com');
commit;
\echo 'expect ERROR: Stock transfer exceeds available stock (a transfer still moves only what is held)'
begin; set local role authenticated;
  insert into public.stock_transfers (uid, from_engineer, to_engineer) values ('NEG-T1', 'NEG ENG', 'NEG COORD');
  insert into public.stock_transfer_lines (transfer_uid, part, qty, reason) values ('NEG-T1', 'NEG-1|NEG PART', 1, 'x');
commit;
reset role;
select 'grants' as check,
  has_function_privilege('authenticated', 'public.notify_negative_handstock(text, text, numeric, numeric, text, text)', 'EXECUTE')::text as signed_in_may_call_should_be_false,
  has_function_privilege('anon', 'public.notify_negative_handstock(text, text, numeric, numeric, text, text)', 'EXECUTE')::text as public_key_may_call_should_be_false;
