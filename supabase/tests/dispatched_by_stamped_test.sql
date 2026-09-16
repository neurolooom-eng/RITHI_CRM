-- ===========================================================================
-- WHO DISPATCHED A STOCK OUT IS STAMPED, NOT SENT (0211).
--
--   Reported from use: "dispatched_by -- Is not actually taking the Name based
--   on the USer. Kasturi is Dispatching whereas it still shows Jagadesh."
--
--   The name on a DELIVERY CHALLAN came from the caller, and the app was
--   sending `user?.name` — a field the User type does not have. So the test
--   that matters is not "does it record a name" but "does it record the name
--   of the person at the keyboard EVEN WHEN THE CALLER SAYS OTHERWISE".
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.spare_dispatches where uid like 'SOX-%' or courier = 'test-courier';

insert into auth.users (id, email) values
 ('ee000000-0000-0000-0000-000000000001','kasthuri@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('ee000000-0000-0000-0000-000000000001','kasthuri@x.com','KASTHURI','stores_incharge')
on conflict (id) do update set full_name = excluded.full_name, email = excluded.email;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo ''
\echo '--- 1. the session resolves to the profile name, not the email ---'
call public.be('kasthuri@x.com');
set role authenticated;
select 'my_display_name()' as check, public.my_display_name() as should_be_KASTHURI;
reset role;

\echo ''
\echo '--- 2. THE CALLER SAYS JAGADEESH; the row says KASTHURI ---'
-- The reported bug, written as an assertion. A client sending the wrong name —
-- for any reason, including the one that caused this — cannot put it on a
-- delivery challan.
call public.be('kasthuri@x.com');
set role authenticated;
insert into public.spare_dispatches (dc_date, engineer, courier, line_count, total_qty, dispatched_by)
 values (current_date, 'ENG', 'test-courier', 1, 1, 'JAGADEESH');
reset role;
select 'what the caller sent vs what was stored' as check,
       dispatched_by as should_be_KASTHURI
  from public.spare_dispatches where courier = 'test-courier';

\echo ''
\echo '--- 3. an empty actor is filled in rather than left blank ---'
delete from public.spare_dispatches where courier = 'test-courier';
call public.be('kasthuri@x.com');
set role authenticated;
insert into public.spare_dispatches (dc_date, engineer, courier, line_count, total_qty, dispatched_by)
 values (current_date, 'ENG', 'test-courier', 1, 1, '');
reset role;
select 'an empty actor' as check, dispatched_by as should_be_KASTHURI
  from public.spare_dispatches where courier = 'test-courier';

\echo ''
\echo '--- 4. NO SESSION: the caller''s value is kept, not blanked ---'
-- An administrative connection — the SQL editor, a restore — has no session to
-- read a name from. Blanking here would lose the only record of who booked the
-- stock out, which is why the trigger tests for a session rather than
-- overwriting unconditionally.
delete from public.spare_dispatches where courier = 'test-courier';
update public.harness set uid = null, email = null;
insert into public.spare_dispatches (dc_date, engineer, courier, line_count, total_qty, dispatched_by)
 values (current_date, 'ENG', 'test-courier', 1, 1, 'IMPORTED FROM THE SHEET');
select 'no session' as check, dispatched_by as should_be_the_supplied_value
  from public.spare_dispatches where courier = 'test-courier';

\echo ''
\echo '--- 5. an EXISTING row is not rewritten ---'
-- Nothing already dispatched is touched: a challan that has gone out says what
-- it said, and rewriting a despatch record after the fact is worse than a name
-- somebody can explain.
call public.be('kasthuri@x.com');
set role authenticated;
update public.spare_dispatches set remarks = 'touched' where courier = 'test-courier';
reset role;
select 'after an unrelated update' as check, dispatched_by as should_be_the_supplied_value
  from public.spare_dispatches where courier = 'test-courier';

delete from public.spare_dispatches where courier = 'test-courier';
