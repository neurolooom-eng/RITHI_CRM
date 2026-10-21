-- ===========================================================================
-- A NEW EMPLOYEE, REQUESTED BY A MANAGER AND APPROVED INTO THE USER MASTER
-- (0449). Superuser bypasses RLS, so everything that matters runs as
-- `authenticated`. Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
  ('rm',                'Reporting Manager', '["mod:/new-employee-requests", "users.request"]'::jsonb),
  ('nsm',               'NSM',               '["mod:/new-employee-requests", "users.request.approve"]'::jsonb),
  ('technical_support', 'Technical Support', '["mod:/new-employee-requests", "users.request.approve"]'::jsonb),
  ('engineer',          'Engineer',          '["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('ee000449-0000-0000-0000-000000000001', 'ner.rm@example.com'),
  ('ee000449-0000-0000-0000-000000000002', 'ner.nsm@example.com'),
  ('ee000449-0000-0000-0000-000000000003', 'ner.ts@example.com'),
  ('ee000449-0000-0000-0000-000000000004', 'ner.eng@example.com')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role, designation) values
  ('ee000449-0000-0000-0000-000000000001', 'ner.rm@example.com',  'Rm Login Name', 'rm', ''),
  ('ee000449-0000-0000-0000-000000000002', 'ner.nsm@example.com', 'NSM ONE', 'nsm', ''),
  ('ee000449-0000-0000-0000-000000000003', 'ner.ts@example.com',  'TS ONE', 'technical_support', ''),
  ('ee000449-0000-0000-0000-000000000004', 'ner.eng@example.com', 'ENG ONE', 'engineer', '')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
-- The Reporting Manager as the User Master names him -- not as his login does.
insert into public.user_directory (name, email, designation, region) values ('RM ONE', 'ner.rm@example.com', 'Reporting Manager', 'South');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo
\echo '--- 1. a Reporting Manager raises a request; the database stamps it ---'
call public.be('ner.rm@example.com');
set role authenticated;
insert into public.employee_requests (name, email, designation, region, regional_manager, reporting_manager, status, decided_by_name)
values ('  NEW PERSON ', 'New.Person@Example.com', 'Service Engineer', 'South', 'RGM ONE', 'SOMEBODY ELSE', 'Approved', 'forged');
select (select req_no like 'NE-%' and status = 'Pending' and decided_by_name = '' and reporting_manager = 'RM ONE'
               and requested_by_role = 'rm' and name = 'NEW PERSON' and email = 'new.person@example.com'
          from public.employee_requests where name = 'NEW PERSON')
       as "numbered, Pending, the Reporting Manager is the requester AS THE USER MASTER NAMES HIM, nothing forged";
select count(*) = 1 as "the requester sees his own request" from public.employee_requests;
\echo '    expect ERROR below -- a request needs a name'
insert into public.employee_requests (name, email) values ('', 'x@example.com');
\echo '    expect ERROR below -- a request needs an address to make the login from'
insert into public.employee_requests (name) values ('NO ADDRESS');
reset role;

\echo
\echo '--- 2. somebody without users.request cannot raise one, nor see others'' ---'
call public.be('ner.eng@example.com');
set role authenticated;
\echo '    expect ERROR below -- row-level security: no users.request'
insert into public.employee_requests (name, email) values ('SNEAK', 'sneak@example.com');
select count(*) = 0 as "an engineer sees nobody's request" from public.employee_requests;
reset role;

\echo
\echo '--- 3. the approvers are told, the requester is not ---'
select (select count(*) from public.notifications where kind = 'employee_request' and title like '%NEW PERSON%'
          and recipient_id in ('ee000449-0000-0000-0000-000000000002', 'ee000449-0000-0000-0000-000000000003')) = 2
   and not exists (select 1 from public.notifications where kind = 'employee_request'
          and recipient_id in ('ee000449-0000-0000-0000-000000000001', 'ee000449-0000-0000-0000-000000000004'))
       as "NSM and Technical Support notified; the requester and the engineer not";

\echo
\echo '--- 4. an approver without "Assign roles" cannot give a role ---'
call public.be('ner.nsm@example.com');
set role authenticated;
select count(*) = 1 as "the approver sees the request" from public.employee_requests;
\echo '    expect ERROR below -- ud_role_guard: setting a role needs Assign roles'
select public.approve_employee_request((select id from public.employee_requests where name = 'NEW PERSON'),
  '{"name":"NEW PERSON","email":"new.person@example.com","role":"nsm"}'::jsonb);
select (select status from public.employee_requests where name = 'NEW PERSON') = 'Pending' as "...and the request is still Pending";

\echo
\echo '--- 5. the FIRST approval, with a correction, adds the person to the User Master ---'
select public.approve_employee_request((select id from public.employee_requests where name = 'NEW PERSON'),
  '{"name":"NEW PERSON","email":"new.person@example.com","designation":"Senior Service Engineer","region":"South",
    "reporting_manager":"RM ONE","regional_manager":"RGM ONE","tags":["CAPA Responsibility"]}'::jsonb) is not null as "approved";
reset role;
select exists (select 1 from public.user_directory where email = 'new.person@example.com' and name = 'NEW PERSON'
                 and designation = 'Senior Service Engineer' and reporting_manager = 'RM ONE'
                 and tags = array['CAPA Responsibility'] and validity)
       as "on the User Master, as corrected";
select (select status = 'Approved' and decided_by_name = 'NSM ONE' and user_directory_id is not null
               and approved_data->>'designation' = 'Senior Service Engineer'
          from public.employee_requests where name = 'NEW PERSON')
       as "the request records who approved it and what was added";
select exists (select 1 from public.notifications where kind = 'employee_request' and title like 'New employee approved: NEW PERSON'
                 and recipient_id = 'ee000449-0000-0000-0000-000000000001') as "the requester is told";

\echo
\echo '--- 6. a second approver finds it already decided ---'
call public.be('ner.ts@example.com');
set role authenticated;
\echo '    expect ERROR below -- already approved, by NSM ONE'
select public.approve_employee_request((select id from public.employee_requests where name = 'NEW PERSON'),
  '{"name":"NEW PERSON","email":"new.person@example.com"}'::jsonb);
select (select count(*) from public.user_directory where email = 'new.person@example.com') = 1 as "still one User Master row";

\echo
\echo '--- 7. the login is recorded, once, and never before approval ---'
select public.employee_request_login((select id from public.employee_requests where name = 'NEW PERSON'), 'new.person@example.com', '');
select (select login_email = 'new.person@example.com' and login_created_at is not null from public.employee_requests where name = 'NEW PERSON')
       as "the login's address and time are recorded";
reset role;

\echo
\echo '--- 8. one person, one User Master row; a rejection needs a reason ---'
call public.be('ner.rm@example.com');
set role authenticated;
insert into public.employee_requests (name, email) values ('SAME AGAIN', 'NEW.PERSON@example.com');
insert into public.employee_requests (name, gmail) values ('TO REJECT', 'to.reject@gmail.com');
reset role;
call public.be('ner.ts@example.com');
set role authenticated;
\echo '    expect ERROR below -- already on the User Master'
select public.approve_employee_request((select id from public.employee_requests where name = 'SAME AGAIN'),
  '{"name":"SAME AGAIN","email":"new.person@example.com"}'::jsonb);
\echo '    expect ERROR below -- only an approved request gets a login'
select public.employee_request_login((select id from public.employee_requests where name = 'TO REJECT'), 'to.reject@gmail.com', '');
\echo '    expect ERROR below -- a rejection needs a reason'
select public.reject_employee_request((select id from public.employee_requests where name = 'TO REJECT'), '  ');
select public.reject_employee_request((select id from public.employee_requests where name = 'TO REJECT'), 'Not on the headcount plan');
reset role;
select (select status = 'Rejected' and reject_reason = 'Not on the headcount plan' and decided_by_name = 'TS ONE'
          from public.employee_requests where name = 'TO REJECT') as "rejected, with the reason and who";
select exists (select 1 from public.notifications where title = 'New employee rejected: TO REJECT'
                 and body like '%Not on the headcount plan%' and recipient_id = 'ee000449-0000-0000-0000-000000000001')
       as "the requester sees why";

\echo
\echo '--- 9. nobody changes or deletes a request round the functions ---'
call public.be('ner.rm@example.com');
set role authenticated;
\echo '    expect ERROR below -- permission denied: no UPDATE grant, so the requester cannot approve his own'
update public.employee_requests set status = 'Approved' where name = 'SAME AGAIN';
reset role;
select (select status from public.employee_requests where name = 'SAME AGAIN') = 'Pending' as "...and it is still Pending";
call public.be('ner.eng@example.com');
set role authenticated;
\echo '    expect ERROR below -- an engineer may not approve'
select public.approve_employee_request((select id from public.employee_requests where name = 'SAME AGAIN'),
  '{"name":"SAME AGAIN","email":"x@example.com"}'::jsonb);
\echo '    expect ERROR below -- permission denied: no DELETE grant'
delete from public.employee_requests;
reset role;
select not has_function_privilege('anon', 'public.approve_employee_request(bigint,jsonb)', 'execute')
   and not has_function_privilege('anon', 'public.reject_employee_request(bigint,text)', 'execute')
   and not has_function_privilege('anon', 'public.employee_request_login(bigint,text,text)', 'execute')
   and not has_function_privilege('authenticated', 'public.employee_request_approvers()', 'execute')
       as "the public key can call none of it";
