-- ===========================================================================
-- A CANCELLED CALL'S STATUS READS "CANCELLED" (0434).
--   A visited, Unsolved Field call cancelled in RITHI reads Cancelled in
--   open_state, and in the call report; restoring it puts back Unsolved.
--   An unattended PM call cancelled and restored goes back to Unattended.
--   A value sent for open_state on a cancelled call is discarded.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('e4340000-0000-0000-0000-000000000001','cs_admin@x.com'),
 ('e4340000-0000-0000-0000-000000000002','cs_hotline@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('e4340000-0000-0000-0000-000000000001','cs_admin@x.com','CS Admin','admin'),
 ('e4340000-0000-0000-0000-000000000002','cs_hotline@x.com','CS Hotline','hotline')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

call public.be('cs_admin@x.com');
insert into public.calls (ucn, call_type, product_name, serial, reg_date, party_name,
                          complaint_reported, standard_complaint, allocated_to)
values ('CS-F1', 'FIELD', 'CSPROD', '1', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CS-P1', 'PM',    'CSPROD', '2', current_date, 'HOSP', 'x', 'y', 'Someone Else');
-- CS-F1 has been visited and came back Unsolved.
update public.field_calls set last_status = 'Unsolved', last_visit_at = now() where ucn = 'CS-F1';

\echo '--- 1. before: Unsolved and Unattended ---'
select 'CS-F1 reads Unsolved' as t, open_state = 'Unsolved' as ok from public.calls where ucn = 'CS-F1';
select 'CS-P1 reads Unattended' as t, open_state = 'Unattended' as ok from public.calls where ucn = 'CS-P1';

\echo '--- 2. cancelled by the Hotline: both read Cancelled ---'
call public.be('cs_hotline@x.com');
begin;
  set local role authenticated;
  select public.cancel_call('CS-F1', 'Pending payment');
  select public.cancel_call('CS-P1', 'PM not due');
commit;
call public.be('cs_admin@x.com');
select 'CS-F1 reads Cancelled, not Unsolved' as t, open_state = 'Cancelled' as ok from public.calls where ucn = 'CS-F1';
select '...its visit status is untouched' as t, last_status = 'Unsolved' as ok from public.calls where ucn = 'CS-F1';
select 'CS-P1 reads Cancelled' as t, open_state = 'Cancelled' as ok from public.calls where ucn = 'CS-P1';
select 'the call report says Cancelled' as t, "Call Status" = 'Cancelled' as ok from public.call_report where "UC Number" = 'CS-F1';

\echo '--- 3. a value sent for open_state is discarded ---'
update public.field_calls set open_state = 'Solved' where ucn = 'CS-F1';
select 'CS-F1 still reads Cancelled' as t, open_state = 'Cancelled' as ok from public.calls where ucn = 'CS-F1';

\echo '--- 4. restored: back to what the visits say ---'
call public.be('cs_hotline@x.com');
begin;
  set local role authenticated;
  select public.restore_call('CS-F1');
  select public.restore_call('CS-P1');
commit;
call public.be('cs_admin@x.com');
select 'CS-F1 reads Unsolved again' as t, open_state = 'Unsolved' as ok from public.calls where ucn = 'CS-F1';
select 'CS-P1 reads Unattended again' as t, open_state = 'Unattended' as ok from public.calls where ucn = 'CS-P1';
