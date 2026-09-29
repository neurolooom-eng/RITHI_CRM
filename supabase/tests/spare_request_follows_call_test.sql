-- ===========================================================================
-- A spare request's Complaint and Item Status follow its call (0268).
--   Editing the CALL updates every request on it, automatically -- even when
--   the person editing may not write spare requests.
--   The rule is the form's: Complaint Reported, else the Standard Complaint.
--   The button / bulk action refreshes chosen requests as the CALLER: an
--   approver may, someone who may not update the request changes nothing.
--   The public key cannot call it.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('5f000000-0000-0000-0000-000000000001','sf_admin@x.com'),
 ('5f000000-0000-0000-0000-000000000002','sf_other@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('5f000000-0000-0000-0000-000000000001','sf_admin@x.com','SF Admin','admin'),
 ('5f000000-0000-0000-0000-000000000002','sf_other@x.com','SF Other','engineer')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, complaint_date,
                                party_name, complaint_reported, standard_complaint, item_status, allocated_to)
values ('SF-1', 'C-SF1', 'FIELD', 'VEGA', '1', current_date, current_date, 'H', 'Alarm beeping', 'NO POWER', 'OGP', 'E');
insert into public.spare_requests (uid, engineer, ucn, complaint, item_status)
values ('SF-R1', 'E', 'SF-1', 'Alarm beeping', 'OGP'),
       ('SF-R2', 'E', 'SF-1', 'Alarm beeping', 'OGP'),
       ('SF-R3', 'E', 'SF-1', 'stale text',   'AMC');

\echo '--- 1. the call''s item status and complaint change: every request follows ---'
\echo 'expect: 3 rows, WGP, Fan noise'
update public.field_calls set item_status = 'WARRANTY', complaint_reported = 'Fan noise' where ucn = 'SF-1';
select uid, item_status, complaint from public.spare_requests where ucn = 'SF-1' order by uid;

\echo '--- 2. with no Complaint Reported the Standard Complaint is used ---'
\echo 'expect: NO POWER on all three'
update public.field_calls set complaint_reported = '' where ucn = 'SF-1';
select distinct complaint from public.spare_requests where ucn = 'SF-1';

\echo '--- 3. the button refreshes a request that had drifted, as an approver ---'
\echo 'expect: 1 changed; SF-R1 back to NO POWER / WGP'
update public.spare_requests set complaint = 'hand typed', item_status = 'AMC' where uid = 'SF-R1';
call public.be('sf_admin@x.com');
begin; set local role authenticated;
  select public.refresh_spare_requests_from_call(array['SF-R1', 'SF-R2']) as changed;
commit;
select uid, item_status, complaint from public.spare_requests where uid = 'SF-R1';

\echo '--- 4. someone who may not update the request changes nothing ---'
\echo 'expect: 0 changed; SF-R2 keeps its drifted value'
update public.spare_requests set complaint = 'drifted' where uid = 'SF-R2';
call public.be('sf_other@x.com');
begin; set local role authenticated;
  select public.refresh_spare_requests_from_call(array['SF-R2']) as changed;
commit;
select uid, complaint from public.spare_requests where uid = 'SF-R2';

\echo '--- 5. the public key cannot call it ---'
\echo 'expect ERROR: permission denied for function refresh_spare_requests_from_call'
begin; set local role anon;
  select public.refresh_spare_requests_from_call(array['SF-R2']);
rollback;
