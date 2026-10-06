-- ===========================================================================
-- THE OLD DCCR REGISTER, WITH ITS CALLS (0394, 0395).
--
--   A row files its call (dated by CALL DATE), its review (imported) and one
--   visit from CURRENT CALL STATUS -- none for Unattended, none for a cancelled
--   call; a P M VISIT row goes to the PM register; a call already in RITHI is
--   left alone; nobody is notified; a re-load corrects; and only a holder of
--   bulk.upload may load.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('d0d0d395-0000-0000-0000-000000000001', 'hist_up@x.com'),
 ('d0d0d395-0000-0000-0000-000000000002', 'hist_no@x.com'),
 ('d0d0d395-0000-0000-0000-000000000003', 'hist_eng@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role, extra_permissions) values
 ('d0d0d395-0000-0000-0000-000000000001', 'hist_up@x.com', 'Hist Up', 'engineer', '["bulk.upload","calls.view"]'),
 ('d0d0d395-0000-0000-0000-000000000002', 'hist_no@x.com', 'Hist No', 'engineer', '["calls.view"]'),
 ('d0d0d395-0000-0000-0000-000000000003', 'hist_eng@x.com', 'HIST ENGINEER', 'engineer', '["calls.view"]')
on conflict (id) do update set extra_permissions = excluded.extra_permissions, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- A live 2026 call with its own review, which the load must not touch.
alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name)
values ('HX-LIVE', 'LIVE-1', 'FIELD', 'VEGA', 'L1', date '2026-02-01', 'LIVE PARTY');
alter table public.field_calls enable trigger user;
insert into public.call_reviews (ucn, spare_category) values ('HX-LIVE', 'CORRECTION');
create temp table n0 as select count(*) as n from public.notifications;
grant select on n0 to authenticated;

\echo '--- 1. A LOAD ---'
call public.be('hist_up@x.com');
begin; set local role authenticated;
insert into public.dccr_history_import (ucn, call_date, complaint_date, call_number, party_name, place, product_name, serial,
  call_type, item_status, engineer, call_status, current_call_status, call_solved_at, spare_category, risk_to_patient,
  warranty_failure, frequent_failure, review2_at, review3_at, complaint_grouping, root_cause_keyword, warranty_start_text)
values
 ('HX-1', '2025-01-02', '2025-01-02', 'C-1', 'PARTY A', 'CHENNAI', 'MONNAL T75', '4694', 'FIELD', 'CMC', 'HIST ENGINEER',
  'Unsolved', 'Solved - Report Completed', '2025-01-05T00:00:00Z', 'SPARE', 'NO', 'NO', 'NO', '2025-01-10', '2025-01-20', 'G', 'K', 'Nov-2015'),
 ('HX-2', '2025-02-02', '2025-02-02', 'C-2', 'PARTY B', 'DELHI', 'VEGA', '8', 'FIELD', 'OGP', 'HIST ENGINEER',
  'Unattended', 'Unattended', null, 'CONSUMABLE', 'NO', 'NO', 'NO', null, null, '', '', ''),
 ('HX-3', '2025-03-02', '2025-03-02', 'C-3', 'PARTY C', 'PUNE', 'VEGA', '9', 'P M VISIT', 'CMC', 'HIST ENGINEER',
  '', 'Solved - Report Completed', '2025-03-03T00:00:00Z', '', '', '', '', null, null, '', '', ''),
 ('HX-4', '2025-04-02', '2025-04-02', 'C-4', 'PARTY D', 'GOA', 'VEGA', '10', 'FIELD', 'WGP', 'HIST ENGINEER',
  '', 'Canceled', '2025-04-03T00:00:00Z', '', '', '', '', null, null, '', '', ''),
 ('HX-LIVE', '2025-05-02', '2025-05-02', 'X', 'FILE PARTY', '', 'VEGA', 'L1', 'FIELD', '', 'HIST ENGINEER',
  '', 'Solved - Report Completed', '2025-05-03T00:00:00Z', 'SPARE', '', '', '', null, null, '', '', '');
commit;

select 'HX-1: a Field call dated 02-Jan-2025, party / place / cover from the file, the month-only warranty start kept as text' as t,
       reg_date = '2025-01-02' and party_name = 'PARTY A' and city = 'CHENNAI' and item_status = 'CMC'
   and call_type = 'FIELD' and extra->>'warranty_start_in_file' = 'Nov-2015' and warranty_start is null as ok
  from public.field_calls where ucn = 'HX-1';
select 'HX-1: its review is imported, and the call reads Solved from the one visit' as t,
       (select imported and spare_category = 'SPARE' and review2_at = '2025-01-10' from public.call_reviews where ucn = 'HX-1')
   and (select count(*) = 1 from public.reports where ucn = 'HX-1')
   and (select open_state from public.calls where ucn = 'HX-1') = 'Solved' as ok;
select 'HX-2: Unattended files NO visit, so the call reads Unattended' as t,
       (select count(*) = 0 from public.reports where ucn = 'HX-2')
   and (select open_state from public.calls where ucn = 'HX-2') = 'Unattended' as ok;
select 'HX-3: a P M VISIT row goes to the PM register' as t,
       exists (select 1 from public.pm_calls where ucn = 'HX-3')
   and not exists (select 1 from public.field_calls where ucn = 'HX-3') as ok;
select 'HX-4: Canceled is filed cancelled, with no visit' as t,
       (select cancelled_at is not null from public.field_calls where ucn = 'HX-4')
   and (select count(*) = 0 from public.reports where ucn = 'HX-4') as ok;
select 'HX-LIVE: a call already in RITHI keeps its party, date and review; no visit added' as t,
       (select party_name = 'LIVE PARTY' and reg_date = '2026-02-01' from public.field_calls where ucn = 'HX-LIVE')
   and (select spare_category = 'CORRECTION' and not coalesce(imported, false) from public.call_reviews where ucn = 'HX-LIVE')
   and (select count(*) = 0 from public.reports where ucn = 'HX-LIVE')
   and (select result from public.dccr_history_import where ucn = 'HX-LIVE') like 'call already in the register%' as ok;
select 'nobody was notified, though every call names an engineer with a login' as t,
       (select count(*) from public.notifications) = (select n from n0) as ok;
select 'no Field Failure Report was raised' as t, not exists (select 1 from public.field_failure_reports where ucn like 'HX-%') as ok;

\echo '--- 2. A RE-LOAD CORRECTS -- and correcting a call needs the right to edit it ---'
\echo 'expect ERROR: correcting the customer needs "Edit customer & product"'
begin; set local role authenticated;
update public.dccr_history_import set party_name = 'PARTY A CORRECTED' where ucn = 'HX-1';
commit;
call public.be('hist_no@x.com');
update public.profiles set extra_permissions = '["bulk.upload","calls.view","calls.edit"]' where email = 'hist_up@x.com';
call public.be('hist_up@x.com');
begin; set local role authenticated;
update public.dccr_history_import set party_name = 'PARTY A CORRECTED' where ucn = 'HX-1';
commit;
select 'the re-load corrected the call it filed, and added no second call or visit' as t,
       (select party_name from public.field_calls where ucn = 'HX-1') = 'PARTY A CORRECTED'
   and (select count(*) from public.field_calls where ucn = 'HX-1') = 1
   and (select count(*) from public.reports where ucn = 'HX-1') = 1 as ok;

\echo '--- 3. ONLY bulk.upload LOADS ---'
call public.be('hist_no@x.com');
\echo 'expect ERROR: no bulk.upload'
begin; set local role authenticated;
insert into public.dccr_history_import (ucn, call_date, call_type) values ('HX-9', '2025-01-01', 'FIELD');
commit;
