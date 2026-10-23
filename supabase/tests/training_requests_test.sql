-- ===========================================================================
-- A NEW EMPLOYEE REQUEST RAISES A TRAINING REQUEST (TRAINING FORM R/HR/11)
-- (0453). The requester gives the plan; the request's decision is the
-- training's approval; the Request No. is typed in; only training.manage
-- edits; nothing is deleted. Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
  ('rm',                'Reporting Manager', '["users.request"]'::jsonb),
  ('nsm',               'NSM',               '["users.request.approve"]'::jsonb),
  ('vp_technical',      'VP Technical',      '["training.manage"]'::jsonb),
  ('engineer',          'Engineer',          '["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id, email) values
  ('ee000453-0000-0000-0000-000000000001', 'trq.rm@example.com'),
  ('ee000453-0000-0000-0000-000000000002', 'trq.nsm@example.com'),
  ('ee000453-0000-0000-0000-000000000003', 'trq.vp@example.com'),
  ('ee000453-0000-0000-0000-000000000004', 'trq.eng@example.com')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role, designation) values
  ('ee000453-0000-0000-0000-000000000001', 'trq.rm@example.com',  'RM LOGIN', 'rm', ''),
  ('ee000453-0000-0000-0000-000000000002', 'trq.nsm@example.com', 'NSM TWO', 'nsm', ''),
  ('ee000453-0000-0000-0000-000000000003', 'trq.vp@example.com',  'VP ONE', 'vp_technical', ''),
  ('ee000453-0000-0000-0000-000000000004', 'trq.eng@example.com', 'ENG TWO', 'engineer', '')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, designation, region) values ('RM TWO', 'trq.rm@example.com', 'Reporting Manager', 'North');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo
\echo '--- 1. a request needs its training plan, and raises the training request ---'
call public.be('trq.rm@example.com');
set role authenticated;
\echo '    expect ERROR below -- no Training Topic'
insert into public.employee_requests (name, email, trainer_name, training_risk) values ('NO TOPIC', 'nt@example.com', 'X', 'Low');
\echo '    expect ERROR below -- the Risk must be Low, Medium or High'
insert into public.employee_requests (name, email, training_topic, trainer_name, training_risk) values ('BAD RISK', 'br@example.com', 'T', 'X', 'Severe');
insert into public.employee_requests (name, email, designation, training_topic, trainer_name, trainer_designation, training_risk)
values ('TRAINEE ONE', 'trainee.one@example.com', 'Service Engineer', 'Product training in Chennai', 'P.M. Bagyaraj', 'National Service Manager', 'medium');
select (select trainee_name = 'TRAINEE ONE' and designation = 'Service Engineer' and manager_name = 'RM TWO'
               and topic = 'Product training in Chennai' and trainer_name = 'P.M. Bagyaraj' and trainer_designation = 'National Service Manager'
               and risk = 'Medium' and approval = 'Pending' and req_no = ''
               and record_lines->0->>'name' = 'TRAINEE ONE'
          from public.training_requests) as "raised with the plan, the Manager the requester as the User Master names him, no number";
select public.training_methodology('Medium') = 'Classroom + Practical' and public.training_methodology('High') = 'Classroom + On Job (1month)'
       and public.training_methodology('Low') = 'Classroom' as "the template's risk-to-method table";
select count(*) = 1 as "the requester sees his training request" from public.training_requests;
-- Row-level security refuses the requester's edit by matching no row.
update public.training_requests set topic = 'changed';
reset role;
select (select topic from public.training_requests where trainee_name = 'TRAINEE ONE') = 'Product training in Chennai'
       as "the requester cannot edit it -- only training.manage";

\echo
\echo '--- 2. the decision on the employee request is the training approval ---'
call public.be('trq.nsm@example.com');
set role authenticated;
select count(*) = 1 as "the approver sees it" from public.training_requests;
select public.approve_employee_request((select id from public.employee_requests where name = 'TRAINEE ONE'),
  '{"name":"TRAINEE ONE","email":"trainee.one@example.com","designation":"Senior Service Engineer"}'::jsonb) is not null as "approved";
reset role;
select (select approval = 'Approved' and approved_by_name = 'NSM TWO' and approved_at is not null and designation = 'Senior Service Engineer'
          from public.training_requests where trainee_name = 'TRAINEE ONE') as "Training Approved by is the approver; the designation as approved";

\echo
\echo '--- 3. training.manage fills the number, the record and the evaluation; the approval cannot be forged ---'
call public.be('trq.vp@example.com');
set role authenticated;
update public.training_requests
   set req_no = ' 102/2026 ', from_date = '2026-11-02', to_date = '2026-11-04',
       record_lines = '[{"name":"TRAINEE ONE","content":"Ventilator basics","status":"Completed"}]',
       evaluation_required = false, evaluation_justification = 'Being refresh training',
       evaluation_plan = '[{"plan":"Practical test","evaluator":"VP ONE","planned_date":"2026-11-10","actual":"","rating":"Meets Expectations"}]',
       reassessment = 'No', remarks = 'ok',
       approval = 'Not approved', approved_by_name = 'FORGED'
 where trainee_name = 'TRAINEE ONE';
reset role;
select (select req_no = '102/2026' and to_date = '2026-11-04' and record_lines->0->>'status' = 'Completed'
               and evaluation_required = false and evaluation_plan->0->>'rating' = 'Meets Expectations' and reassessment = 'No'
               and approval = 'Approved' and approved_by_name = 'NSM TWO'
          from public.training_requests where trainee_name = 'TRAINEE ONE')
       as "number, record and evaluation saved; the approval kept, the forged one discarded";
call public.be('trq.vp@example.com');
set role authenticated;
\echo '    expect ERROR below -- the training cannot end before it starts'
update public.training_requests set to_date = '2026-10-01' where trainee_name = 'TRAINEE ONE';
\echo '    expect ERROR below -- permission denied: no DELETE grant'
delete from public.training_requests;
reset role;

\echo
\echo '--- 4. a rejection reads Not approved, with its reason; outsiders see nothing ---'
call public.be('trq.rm@example.com');
set role authenticated;
insert into public.employee_requests (name, gmail, training_topic, trainer_name, training_risk)
values ('TRAINEE TWO', 'trainee.two@gmail.com', 'Induction', 'VP ONE', 'High');
reset role;
call public.be('trq.nsm@example.com');
set role authenticated;
select public.reject_employee_request((select id from public.employee_requests where name = 'TRAINEE TWO'), 'Not budgeted');
reset role;
select (select approval = 'Not approved' and not_approved_reason = 'Not budgeted' and approved_by_name = 'NSM TWO'
          from public.training_requests where trainee_name = 'TRAINEE TWO') as "Not approved, with the reason (If No Reason)";
call public.be('trq.eng@example.com');
set role authenticated;
select count(*) = 0 as "an engineer sees no training request" from public.training_requests;
reset role;
