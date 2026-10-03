-- ===========================================================================
-- A SPARE REQUEST ON A CALL WITH NO VISIT FILES THE VISIT IT IMPLIES (0332).
--
-- WHAT THIS PROVES:
--   1. a call-based request on a call with NO visit files one: Unsolved, the
--      requesting engineer, the request date, the master's "spare not
--      available" reason, Update Visit Work Details = No -- and the call reads
--      Unsolved;
--   2. a second request on the same call files nothing more (the first visit is
--      a visit);
--   3. a call that ALREADY HAD a visit before the request gets none;
--   4. a HandStock request files nothing;
--   5. only the person who raised the request may call it, and only with
--      spare.request -- it is SECURITY DEFINER, so this is the whole guard.
--
-- Run ONCE after _stub.sql + every migration, as `authenticated` where it
-- matters: a superuser ignores EXECUTE grants and RLS.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('03320000-0000-0000-0000-000000000001', 'sv-eng@x.com'),
  ('03320000-0000-0000-0000-000000000002', 'sv-other@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('03320000-0000-0000-0000-000000000001', 'sv-eng@x.com',   'SV ENG',   'engineer'),
  ('03320000-0000-0000-0000-000000000002', 'sv-other@x.com', 'SV OTHER', 'engineer')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

insert into public.field_calls (ucn, call_number, party_name, allocated_to, complaint_date) values
  ('SV-NOVISIT', 'CN-SV1', 'ACME', 'SV ENG', current_date - 3),
  ('SV-VISITED', 'CN-SV2', 'ACME', 'SV ENG', current_date - 3);
insert into public.reports (uid, ucn, call_status, pending_reason, engineer, visit_at, updated_at)
values ('IMP-SV-VISITED-1', 'SV-VISITED', 'Unsolved', 'CUSTOMER NOT AVAILABLE', 'SV ENG',
        (current_date - 1)::timestamptz, now() - interval '1 day');

-- The requests, raised by SV ENG as the screen raises them.
call public.be('sv-eng@x.com');
set role authenticated;
insert into public.spare_requests (uid, req_type, engineer, engineer_email, ucn, call_number) values
  ('SV-REQ-1', 'Call Based', 'SV ENG', 'sv-eng@x.com', 'SV-NOVISIT', 'CN-SV1'),
  ('SV-REQ-2', 'Call Based', 'SV ENG', 'sv-eng@x.com', 'SV-NOVISIT', 'CN-SV1'),
  ('SV-REQ-3', 'Call Based', 'SV ENG', 'sv-eng@x.com', 'SV-VISITED', 'CN-SV2'),
  ('SV-REQ-4', 'HandStock',  'SV ENG', 'sv-eng@x.com', '',           '');
reset role;
select 'fixture' as check,
       (select count(*) from public.spare_requests where uid like 'SV-REQ-%')::text as requests_should_be_4;

\echo ''
\echo '--- 1. no visit yet: the request files one ---'
call public.be('sv-eng@x.com');
set role authenticated;
select public.file_visit_for_spare_request('SV-REQ-1') as result_should_start_filed;
reset role;
select 'the visit it filed' as check,
       r.call_status   as should_be_unsolved,
       r.pending_reason as should_be_spares_not_available,
       r.engineer      as should_be_sv_eng,
       ((r.visit_at at time zone 'UTC')::date = (now() at time zone 'Asia/Kolkata')::date)::text as dated_today_should_be_true,
       r.data->>'Update Visit Work Details?' as should_be_no,
       (r.data->>'Spare Request' <> '')::text as names_request_should_be_true,
       (select c.last_status from public.calls c where c.ucn = 'SV-NOVISIT') as call_last_status_should_be_unsolved,
       (select c.status from public.calls c where c.ucn = 'SV-NOVISIT') as call_status_should_be_unsolved
  from public.reports r where r.ucn = 'SV-NOVISIT';

\echo ''
\echo '--- 2. a second request on the same call files nothing more ---'
set role authenticated;
select public.file_visit_for_spare_request('SV-REQ-2') as should_be_skipped_already_has_visit;
select public.file_visit_for_spare_request('SV-REQ-1') as retry_should_be_skipped;
reset role;
select 'one visit only' as check,
       (select count(*) from public.reports where ucn = 'SV-NOVISIT')::text as should_be_1;

\echo ''
\echo '--- 3. a visit filed BEFORE the request: nothing is added ---'
set role authenticated;
select public.file_visit_for_spare_request('SV-REQ-3') as should_be_skipped_already_has_visit;
reset role;
select 'the earlier visit stands alone' as check,
       (select count(*) from public.reports where ucn = 'SV-VISITED')::text as should_be_1;

\echo ''
\echo '--- 4. a HandStock request files nothing ---'
set role authenticated;
select public.file_visit_for_spare_request('SV-REQ-4') as should_be_skipped_not_call_based;
reset role;

\echo ''
\echo '--- 5. the guard: somebody else, and the public key ---'
call public.be('sv-other@x.com');
set role authenticated;
\echo 'expect ERROR: only the person who raised the request'
select public.file_visit_for_spare_request('SV-REQ-1');
reset role;
set role anon;
\echo 'expect ERROR: permission denied for function (anon)'
select public.file_visit_for_spare_request('SV-REQ-1');
reset role;
