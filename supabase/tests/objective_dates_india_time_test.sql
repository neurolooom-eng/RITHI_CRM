-- ===========================================================================
-- THE OBJECTIVE FIGURES DATE A VISIT IN INDIA TIME (0423, D-168).
--
--   Run with the session on UTC, as the live project is. A call registered on
--   10 March and solved at 01:00 IST on 14 March is solved on 14 March, so a
--   13-March cut-off counts it OPEN; that first visit is 4 days after
--   registration, not 3, so it is NOT attended within 3 days. Before 0423 both
--   read the UTC date (13 March), a day earlier -- all three checks fail.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
set timezone = 'UTC';

insert into auth.users (id, email) values ('0e423000-0000-0000-0000-000000000001', 'd168_admin@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e423000-0000-0000-0000-000000000001', 'd168_admin@x.com', 'D168 Admin', 'admin')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
call public.be('d168_admin@x.com');

alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, reg_at, complaint_date, product_name, serial, party_name) values
 ('D168-1', 'C1', 'FIELD CALL', date '2025-03-10', timestamptz '2025-03-10 10:00+05:30', date '2025-03-10', 'VEGA', 'S1', 'P');
alter table public.field_calls enable trigger user;
alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
 ('D168-V1', 'D168-1', 'Solved - Report Completed', '{}'::jsonb,
  timestamptz '2025-03-14 01:00+05:30', timestamptz '2025-04-04 01:00+05:30');
alter table public.reports enable trigger user;

insert into public.quality_objectives (year, sort_order, process, parameter, yearly_target, frequency, calc_key, calc_params) values
 (2025, 423, 'TEST', 'D168 open',     '<35%', 'Monthly', 'open_rate_monthly',    '{"family":"field","cutoff_date":"2025-03-13"}'),
 (2025, 424, 'TEST', 'D168 attended', '>75%', 'Monthly', 'attended_within_days', '{"family":"field","days":3}');

\echo '--- 1. solved at 01:00 IST on 14 March: after a 13-March cut-off (UTC would say 13 March) ---'
select 'open rate: the call is OPEN at the 13-Mar cut-off -- 1 of 1' as t,
  public.objective_value(id, 3) = 1 as ok
  from public.quality_objectives where parameter = 'D168 open';
select 'evidence: the call is open and its closing date reads 14 March' as t,
  bool_and(role = 'open' and closure_date = date '2025-03-14') as ok
  from public.objective_evidence((select id from public.quality_objectives where parameter = 'D168 open'), 3)
 where ucn = 'D168-1';

\echo '--- 2. first visit at 01:00 IST on 14 March, registered 10 March: 4 days, not attended within 3 ---'
select 'attended rate: 0 of 1 within 3 days (UTC would count 3 days)' as t,
  public.objective_value(id, 3) = 0 as ok
  from public.quality_objectives where parameter = 'D168 attended';
