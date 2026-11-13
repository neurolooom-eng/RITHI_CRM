-- ===========================================================================
-- REQUEST REGISTRATION v2 AND Req_VisitTable (0475).
--   The True Key is RQ2-yymm-nnnn, issued by the database once per request,
--   and each machine's Req_VisitTable row is keyed <True Key>-<Product>-<Serial>.
--   Attended = Yes: one Req_VisitTable row per machine -- Call Status
--   Unsolved, the requester's name and login email, the Attended Date, the
--   entry time, and a Call Pending Reason that must be on the master list.
--   Attended = No: no row. One save is all or nothing.
--   Only the v2 key (an administrator) may save; the public key reaches nothing.
--   Registered as a call: the row is filed as that call's visit, once.
--   Mapped to a call: nothing is filed.
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e475000-0000-0000-0000-000000000001', 'v2_admin@x.com'),
  ('0e475000-0000-0000-0000-000000000002', 'v2_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e475000-0000-0000-0000-000000000001', 'v2_admin@x.com', 'V2 Admin', 'admin'),
  ('0e475000-0000-0000-0000-000000000002', 'v2_eng@x.com',   'V2 Eng',   'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
insert into public.masters (name, value) values ('pendingreason', 'V2 Spare Awaited');

-- A field call each registration below can point at.
alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, reg_at, complaint_date, product_name, serial, party_name, allocated_to) values
  ('V2-C1', 'V2N1', 'FIELD CALL', current_date - 3, (current_date - 3)::timestamp at time zone 'Asia/Kolkata' + interval '10 hours 15 minutes', current_date - 3, 'V2PROD', 'V2S1', 'P', 'V2 Admin'),
  ('V2-C2', 'V2N2', 'FIELD CALL', current_date - 3, null, current_date - 3, 'V2PROD', 'V2S2', 'P', 'V2 Admin'),
  ('V2-C3', 'V2N3', 'FIELD CALL', current_date - 3, null, current_date - 3, 'V2PROD', 'V2S5', 'P', 'V2 Admin');
alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
  ('V2-EXISTING', 'V2-C3', 'Unsolved', '{}', now() - interval '2 days', now() - interval '2 days');
alter table public.reports enable trigger user;
alter table public.field_calls enable trigger user;

\echo '--- 1. an administrator saves an attended v2 request for two machines ---'
\echo 'expect: RQ2-<yymm>-0001 | 2 requests | 2 visits keyed RQ2-<yymm>-0001-V2PROD-V2S1 / -V2S2'
call public.be('v2_admin@x.com');
begin; set local role authenticated;
  select (r->>'true_key') = 'RQ2-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '-0001' as first_key,
         (r->>'count')::int as requests, jsonb_array_length(r->'visit_keys') as visits
    from public.submit_call_request_v2(
      ('{"email":"v2_admin@x.com","engineer":"V2 Admin","call_type":"FIELD","party_name":"P","call_attended":"Yes","attended_date":"' || (current_date - 1)::text || '","additional_comments":""}')::jsonb,
      '[{"product":"V2PROD","serial_no":"V2S1","standard_complaint":"X","reported_problem":"Y"},{"product":"V2PROD","serial_no":"V2S2","standard_complaint":"X","reported_problem":"Y"}]'::jsonb,
      'V2 Spare Awaited') r;
commit;

\echo '--- 2. the rows: the request carries the True Key; the visit what the database decided ---'
\echo 'expect: 2 | Unsolved | V2 Admin | v2_admin@x.com | the attended date | V2 Spare Awaited | entered now'
select count(*) filter (where c.true_key = t.true_key) as linked,
       min(t.call_status) as status, min(t.engineer) as engineer, min(t.engineer_email) as email,
       min(t.visit_date) = current_date - 1 as visit_is_attended_date, min(t.pending_reason) as reason,
       bool_and(t.visit_entry_at > now() - interval '1 minute') as entered_now,
       bool_and(t.visit_key = t.true_key || '-' || t.product || '-' || t.serial_no) as keyed
  from public.req_visit_table t join public.call_requests c on c.unique_key = t.request_unique_key
 where t.product = 'V2PROD';

\echo '--- 3. the next request takes the next number; not attended -> no visit row ---'
\echo 'expect: -0002 | 1 request | 0 visits'
call public.be('v2_admin@x.com');
begin; set local role authenticated;
  select right(r->>'true_key', 5) as number, (r->>'count')::int as requests, jsonb_array_length(r->'visit_keys') as visits
    from public.submit_call_request_v2(
      ('{"email":"v2_admin@x.com","engineer":"V2 Admin","call_type":"FIELD","party_name":"P","call_attended":"No","plan_date":"' || current_date::text || '"}')::jsonb,
      '[{"product":"V2PROD","serial_no":"V2S3","standard_complaint":"X","reported_problem":"Y"}]'::jsonb, '') r;
commit;

\echo '--- 3b. Call Status shown (0476): Solved - Report Pending is kept; anything else refused ---'
call public.be('v2_admin@x.com');
begin; set local role authenticated;
  select public.submit_call_request_v2(
    ('{"email":"v2_admin@x.com","engineer":"V2 Admin","call_type":"FIELD","party_name":"P","call_attended":"Yes","attended_date":"' || (current_date - 1)::text || '"}')::jsonb,
    '[{"product":"V2PROD","serial_no":"V2S5","standard_complaint":"X","reported_problem":"Y"}]'::jsonb,
    'V2 Spare Awaited', 'Solved - Report Pending') is not null as saved;
commit;
\echo 'expect: Solved - Report Pending | REPORT PENDING (0478: the reason sent is replaced)'
select call_status, pending_reason from public.req_visit_table where serial_no = 'V2S5';
\echo 'expect: saved with no reason sent, and it reads REPORT PENDING -- not looked up on the master'
begin; set local role authenticated;
  select public.submit_call_request_v2(
    ('{"call_type":"FIELD","party_name":"P","call_attended":"Yes","attended_date":"' || (current_date - 1)::text || '"}')::jsonb,
    '[{"product":"V2PROD","serial_no":"V2S6","standard_complaint":"X","reported_problem":"Y"}]'::jsonb,
    '', 'Solved - Report Pending') is not null as saved;
commit;
select pending_reason from public.req_visit_table where serial_no = 'V2S6';
\echo 'expect ERROR: Call Status must be Unsolved or Solved - Report Pending'
begin; set local role authenticated;
  select public.submit_call_request_v2('{"call_type":"FIELD","call_attended":"Yes","attended_date":"2026-01-01"}'::jsonb,
    '[{"product":"V2PROD","serial_no":"V2S9"}]'::jsonb, 'V2 Spare Awaited', 'Solved - Report Completed');
rollback;
\echo 'expect: the old three-argument save is gone (0476)'
select to_regprocedure('public.submit_call_request_v2(jsonb,jsonb,text)') is null as gone;

\echo '--- 3c. per call (0482): call 1 attended, call 2 not, in one request ---'
\echo 'expect: 2 requests, 1 visit | call 1 Yes with its date, call 2 No with its plan date | visit Unsolved V2 Spare Awaited'
call public.be('v2_admin@x.com');
begin; set local role authenticated;
  select (r->>'count')::int as requests, jsonb_array_length(r->'visit_keys') as visits
    from public.submit_call_request_v2(
      '{"call_type":"FIELD","party_name":"P"}'::jsonb,
      ('[{"product":"V2PROD","serial_no":"V2P1","standard_complaint":"X","reported_problem":"Y","call_attended":"Yes","attended_date":"' || (current_date - 2)::text || '","call_status":"Unsolved","pending_reason":"V2 Spare Awaited"},'
       || '{"product":"V2PROD","serial_no":"V2P2","standard_complaint":"X","reported_problem":"Y","call_attended":"No","plan_date":"' || (current_date + 1)::text || '"}]')::jsonb,
      '', 'Unsolved') r;
commit;
select serial_no, call_attended, attended_date = current_date - 2 as own_date, plan_date = current_date + 1 as own_plan
  from public.call_requests where serial_no in ('V2P1', 'V2P2') order by serial_no;
select serial_no, call_status, pending_reason from public.req_visit_table where serial_no in ('V2P1', 'V2P2');
\echo 'expect ERROR: Call 2: Call Pending Reason is required'
begin; set local role authenticated;
  select public.submit_call_request_v2('{"call_type":"FIELD"}'::jsonb,
    ('[{"product":"V2PROD","serial_no":"V2P3","call_attended":"No"},'
     || '{"product":"V2PROD","serial_no":"V2P4","call_attended":"Yes","attended_date":"2026-01-01","call_status":"Unsolved"}]')::jsonb, '', 'Unsolved');
rollback;

\echo '--- 4. what is refused ---'
\echo 'expect ERROR: Call Pending Reason is required'
begin; set local role authenticated;
  select public.submit_call_request_v2('{"call_type":"FIELD","call_attended":"Yes","attended_date":"2026-01-01"}'::jsonb,
    '[{"product":"V2PROD","serial_no":"V2S9"}]'::jsonb, '');
rollback;
\echo 'expect ERROR: Attended Date is required'
begin; set local role authenticated;
  select public.submit_call_request_v2('{"call_type":"FIELD","call_attended":"Yes"}'::jsonb,
    '[{"product":"V2PROD","serial_no":"V2S9"}]'::jsonb, 'V2 Spare Awaited');
rollback;
\echo 'expect ERROR: not on it'
begin; set local role authenticated;
  select public.submit_call_request_v2('{"call_type":"FIELD","call_attended":"Yes","attended_date":"2026-01-01"}'::jsonb,
    '[{"product":"V2PROD","serial_no":"V2S9"}]'::jsonb, 'Something typed');
rollback;
\echo 'expect: 0 (nothing of the refused saves is left behind)'
select count(*) as left_behind from public.call_requests where serial_no = 'V2S9';

\echo '--- 5. an engineer may not use v2 ---'
\echo 'expect ERROR: administrators only'
call public.be('v2_eng@x.com');
begin; set local role authenticated;
  select public.submit_call_request_v2('{"call_type":"FIELD","call_attended":"No"}'::jsonb, '[{"product":"V2PROD","serial_no":"V2S8"}]'::jsonb, '');
rollback;
\echo 'expect ERROR: row-level security'
begin; set local role authenticated;
  insert into public.req_visit_table (visit_key, true_key, request_unique_key, pending_reason, visit_date)
  values ('X-1', 'X', 'X', 'V2 Spare Awaited', current_date);
rollback;

\echo '--- 6. a Req_VisitTable row is never edited or deleted from outside ---'
\echo 'expect ERROR: permission denied for table req_visit_table'
call public.be('v2_admin@x.com');
begin; set local role authenticated;
  update public.req_visit_table set pending_reason = 'x';
rollback;

\echo '--- 7. registered as a call: the visit is filed on it, once ---'
\echo 'expect: 1 visit on V2-C1, uid = the visit key, Unsolved, V2 Spare Awaited, dated the attended date | the call reads Unsolved | Req_VisitTable knows the call'
update public.call_requests set ucn = 'V2-C1', status = 'Registered' where serial_no = 'V2S1';
update public.call_requests set additional_comments = additional_comments where serial_no = 'V2S1';
select count(*) as visits, min(r.uid) = min(t.visit_key) as uid_is_key, min(r.call_status) as status, min(r.pending_reason) as reason,
       (min(r.visit_at) at time zone 'UTC')::date = current_date - 1 as dated
  from public.reports r join public.req_visit_table t on t.report_uid = r.uid
 where r.ucn = 'V2-C1';
select open_state from public.calls where ucn = 'V2-C1';
select ucn, report_uid <> '' as filed from public.req_visit_table where serial_no = 'V2S1';
\echo 'expect: t | t -- the Visit Entry Date is the call''s registration + 1 minute, not the request''s save time'
select r.updated_at = (select reg_at from public.field_calls where ucn = 'V2-C1') + interval '1 minute' as entry_is_reg_plus_1,
       r.data->>'Visit Entry Date' = to_char(r.updated_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') as data_agrees
  from public.reports r where r.ucn = 'V2-C1';

\echo '--- 8. mapped (0480): a call with NO visit takes it; a call with visits keeps its own ---'
\echo 'expect: 1 visit on V2-C2, entered at its registration date (00:00 IST) + 1 minute'
update public.call_requests set ucn = 'V2-C2', status = 'Mapped' where serial_no = 'V2S2';
select count(*) as visits,
       min(updated_at) = ((current_date - 3)::timestamp at time zone 'Asia/Kolkata') + interval '1 minute' as entry_is_reg_plus_1
  from public.reports where ucn = 'V2-C2';
\echo 'expect: still 1 visit on V2-C3 (its own), and the request row unfiled'
update public.call_requests set ucn = 'V2-C3', status = 'Mapped' where serial_no = 'V2S5';
select (select count(*) from public.reports where ucn = 'V2-C3') as visits,
       (select report_uid = '' from public.req_visit_table where serial_no = 'V2S5') as unfiled;

\echo '--- 9. the public key reaches nothing ---'
\echo 'expect ERROR: administrators only'
call public.be('v2_eng@x.com');
begin; set local role authenticated;
  select public.next_rq2_key();
rollback;
\echo 'expect ERROR: permission denied for table req_visit_table'
begin; set local role anon;
  select count(*) from public.req_visit_table;
rollback;
\echo 'expect ERROR: permission denied for function submit_call_request_v2'
begin; set local role anon;
  select public.submit_call_request_v2('{}'::jsonb, '[]'::jsonb, '', 'Unsolved');
rollback;
