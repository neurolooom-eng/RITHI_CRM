-- ===========================================================================
-- THE CALL PENDING REASON OF AN OPEN CALL (0433).
--
--   PR-1 two Unsolved visits; the one ENTERED LATER has the earlier visit
--        date                                  -> the later ENTRY's reason
--        (the entry the call's status comes from), not the later visit's.
--   PR-2 Solved, its last visit carried a reason   -> blank.
--   PR-3 Cancelled while Unsolved                  -> blank.
--   PR-4 Solved and then RE-OPENED                 -> the latest entry's reason.
--   PR-5 open, never visited                       -> blank.
--   PR-6 an engineer sees no row for a call they may not see, and their own.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
set timezone = 'UTC';

insert into auth.users (id, email) values
  ('0e433000-0000-0000-0000-000000000001', 'pr_admin@x.com'),
  ('0e433000-0000-0000-0000-000000000002', 'pr_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e433000-0000-0000-0000-000000000001', 'pr_admin@x.com', 'PR Admin', 'admin'),
  ('0e433000-0000-0000-0000-000000000002', 'pr_eng@x.com',   'PR Eng',   'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.user_directory where email in ('pr_eng@x.com', 'pr_other@x.com');
insert into public.user_directory (name, email, reporting_manager) values
  ('PR Eng', 'pr_eng@x.com', ''), ('PR Other', 'pr_other@x.com', '');

alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, allocated_to,
                                open_state, cancelled_at, cancel_reason, reopened_at) values
  ('PR-1', 'P1', 'FIELD CALL', date '2025-03-10', 'VEGA', 'S1', 'P', 'PR Other', 'Unsolved', null, '', null),
  ('PR-2', 'P2', 'FIELD CALL', date '2025-03-10', 'VEGA', 'S2', 'P', 'PR Other', 'Solved',   null, '', null),
  ('PR-3', 'P3', 'FIELD CALL', date '2025-03-10', 'VEGA', 'S3', 'P', 'PR Other', 'Unsolved', now(), 'Raised twice', null),
  ('PR-4', 'P4', 'FIELD CALL', date '2025-03-10', 'VEGA', 'S4', 'P', 'PR Other', 'Solved',   null, '', now()),
  ('PR-5', 'P5', 'FIELD CALL', date '2025-03-10', 'VEGA', 'S5', 'P', 'PR Other', 'Unattended', null, '', null),
  ('PR-6', 'P6', 'FIELD CALL', date '2025-03-10', 'VEGA', 'S6', 'P', 'PR Eng',   'Unsolved', null, '', null);
alter table public.field_calls enable trigger user;

alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, pending_reason, data, visit_at, updated_at) values
  ('PR-V11', 'PR-1', 'Unsolved', 'Awaiting Spare',         '{}', timestamptz '2025-03-14 00:00+05:30', timestamptz '2025-03-14 18:00+05:30'),
  ('PR-V12', 'PR-1', 'Unsolved', 'Customer Not Available', '{}', timestamptz '2025-03-12 00:00+05:30', timestamptz '2025-03-20 18:00+05:30'),
  ('PR-V21', 'PR-2', 'Solved - Report Completed', 'Awaiting Spare', '{}', timestamptz '2025-03-14 00:00+05:30', timestamptz '2025-03-14 18:00+05:30'),
  ('PR-V31', 'PR-3', 'Unsolved', 'Awaiting Spare',         '{}', timestamptz '2025-03-14 00:00+05:30', timestamptz '2025-03-14 18:00+05:30'),
  ('PR-V41', 'PR-4', 'Unsolved', '  Awaiting Spare  ',     '{}', timestamptz '2025-03-14 00:00+05:30', timestamptz '2025-03-14 18:00+05:30'),
  ('PR-V61', 'PR-6', 'Unsolved', 'Awaiting Spare',         '{}', timestamptz '2025-03-14 00:00+05:30', timestamptz '2025-03-14 18:00+05:30');
alter table public.reports enable trigger user;

call public.be('pr_admin@x.com');

\echo '--- 1. the latest ENTRY gives the reason, not the latest visit date ---'
select 'PR-1: Customer Not Available' as t, pending_reason = 'Customer Not Available' as ok
  from public.call_dates where ucn = 'PR-1';

\echo '--- 2-3. a Solved or a Cancelled call is pending nothing ---'
select 'PR-2 (Solved): blank' as t, pending_reason is null as ok from public.call_dates where ucn = 'PR-2';
select 'PR-3 (Cancelled): blank' as t, pending_reason is null as ok from public.call_dates where ucn = 'PR-3';
select 'PR-3 keeps its cancellation reason on the call' as t, cancel_reason = 'Raised twice' as ok
  from public.calls where ucn = 'PR-3';

\echo '--- 4-5. re-opened shows the reason, trimmed; never visited is blank ---'
select 'PR-4 (re-opened): Awaiting Spare' as t, pending_reason = 'Awaiting Spare' as ok from public.call_dates where ucn = 'PR-4';
select 'PR-5 (never visited): blank' as t, pending_reason is null as ok from public.call_dates where ucn = 'PR-5';

\echo '--- 6. as the engineer: their own call, and no row for one they may not see ---'
call public.be('pr_eng@x.com');
set role authenticated;
select 'PR-6 (theirs): Awaiting Spare' as t, pending_reason = 'Awaiting Spare' as ok from public.call_dates where ucn = 'PR-6';
select 'PR-1 (not theirs): no row' as t, not exists (select 1 from public.call_dates where ucn = 'PR-1') as ok;
reset role;

delete from public.reports where uid like 'PR-V%';
