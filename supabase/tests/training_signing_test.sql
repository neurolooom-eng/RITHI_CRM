-- ===========================================================================
-- TRAINING FORMS ADDED FROM THE HR DOCUMENT, SIGNED BY THE PEOPLE THEY NAME,
-- AND THE SIGNATURE TRACKER (0454). Every error printed is labelled
-- `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
  ('vp_technical', 'VP Technical', '["training.manage"]'::jsonb),
  ('hr_desk',      'HR Desk',      '["users.manage.details"]'::jsonb),
  ('engineer',     'Engineer',     '["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id, email) values
  ('ee000454-0000-0000-0000-000000000001', 'tsg.vp@example.com'),
  ('ee000454-0000-0000-0000-000000000002', 'tsg.arun@example.com'),
  ('ee000454-0000-0000-0000-000000000003', 'tsg.bala@example.com'),
  ('ee000454-0000-0000-0000-000000000004', 'tsg.trainer@example.com'),
  ('ee000454-0000-0000-0000-000000000005', 'tsg.hr@example.com')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role, designation) values
  ('ee000454-0000-0000-0000-000000000001', 'tsg.vp@example.com',      'VP SIGN', 'vp_technical', ''),
  ('ee000454-0000-0000-0000-000000000002', 'tsg.arun@example.com',    'Arun login', 'engineer', 'Service Engineer'),
  ('ee000454-0000-0000-0000-000000000003', 'tsg.bala@example.com',    'BALA S', 'engineer', 'Service Engineer'),
  ('ee000454-0000-0000-0000-000000000004', 'tsg.trainer@example.com', 'P.M. BAGYARAJ', 'engineer', 'NSM'),
  ('ee000454-0000-0000-0000-000000000005', 'tsg.hr@example.com',      'HR ONE', 'hr_desk', '')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
-- Arun's form name is the User Master's; adding him there renames his login to it (0199).
insert into public.user_directory (name, email, designation) values ('ARUN K', 'tsg.arun@example.com', 'Service Engineer');
insert into public.user_signatures (user_id, signature) values
  ('ee000454-0000-0000-0000-000000000002', 'data:image/png;base64,ARUN'),
  ('ee000454-0000-0000-0000-000000000004', 'data:image/png;base64,TRAINER');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo
\echo '--- 1. the training team adds a form from the HR document; no approval step ---'
call public.be('tsg.vp@example.com');
set role authenticated;
insert into public.training_requests (req_no, req_date, trainee_name, designation, topic, trainer_name, risk,
                                      approval, approved_by_name, record_lines, source_doc_url, source_doc_name, evaluator_name)
values ('102/2026', '2026-10-21', 'Service Team', 'Service Engineers', 'Product training in Chennai', 'P.M. Bagyaraj', 'Low',
        'Approved', 'HR Head', '[{"name":"ARUN K","content":"Ventilator basics","status":""},{"name":"BALA S","content":"Ventilator basics","status":"","signature":"data:image/png;base64,FORGED"}]',
        'https://drive.google.com/file/d/x', '102_2026 Service.docx', 'P.M. Bagyaraj');
reset role;
select (select approval = 'Approved' and approved_by_name = 'HR Head' and source_doc_name = '102_2026 Service.docx'
               and coalesce(record_lines->1->>'signature', '') = ''
          from public.training_requests where req_no = '102/2026')
       as "added with the HR document's approval; a signature sent with it is stripped";
call public.be('tsg.arun@example.com');
set role authenticated;
\echo '    expect ERROR below -- only the training team adds one'
insert into public.training_requests (topic) values ('sneak');
reset role;

\echo
\echo '--- 2. each person signs their own part, and only theirs ---'
call public.be('tsg.arun@example.com');
set role authenticated;
select count(*) = 1 as "a trainee named on a line can read the form" from public.training_requests where req_no = '102/2026';
select public.sign_training_request((select id from public.training_requests where req_no = '102/2026'), 'line', 0);
\echo '    expect ERROR below -- line 2 names BALA S, not Arun'
select public.sign_training_request((select id from public.training_requests where req_no = '102/2026'), 'line', 1);
\echo '    expect ERROR below -- Arun is not the trainer'
select public.sign_training_request((select id from public.training_requests where req_no = '102/2026'), 'trainer');
\echo '    expect ERROR below -- already signed'
select public.sign_training_request((select id from public.training_requests where req_no = '102/2026'), 'line', 0);
reset role;
call public.be('tsg.bala@example.com');
set role authenticated;
\echo '    expect ERROR below -- BALA S has no saved signature'
select public.sign_training_request((select id from public.training_requests where req_no = '102/2026'), 'line', 1);
reset role;
call public.be('tsg.trainer@example.com');
set role authenticated;
select public.sign_training_request((select id from public.training_requests where req_no = '102/2026'), 'trainer');
select public.sign_training_request((select id from public.training_requests where req_no = '102/2026'), 'evaluator');
reset role;
select (select record_lines->0->>'signature' = 'data:image/png;base64,ARUN' and record_lines->0->>'signed_name' = 'ARUN K'
               and trainer_signed->>'signature' = 'data:image/png;base64,TRAINER'
               and evaluator_signed->>'signature' = 'data:image/png;base64,TRAINER'
          from public.training_requests where req_no = '102/2026')
       as "each part carries its own signer's signature";

\echo
\echo '--- 3. an edit keeps the signatures, and cannot place or move one ---'
call public.be('tsg.vp@example.com');
set role authenticated;
update public.training_requests
   set record_lines = '[{"name":"ARUN K","content":"Ventilator basics + alarms","status":"Completed"},
                        {"name":"BALA S","content":"Ventilator basics","status":"Completed","signature":"data:image/png;base64,FORGED"}]',
       trainer_signed = '{"signature":"data:image/png;base64,FORGED"}'
 where req_no = '102/2026';
reset role;
select (select record_lines->0->>'signature' = 'data:image/png;base64,ARUN' and record_lines->0->>'content' = 'Ventilator basics + alarms'
               and coalesce(record_lines->1->>'signature', '') = ''
               and trainer_signed->>'signature' = 'data:image/png;base64,TRAINER'
          from public.training_requests where req_no = '102/2026')
       as "the topic updated, Arun's signature kept, the forged ones discarded";
call public.be('tsg.vp@example.com');
set role authenticated;
update public.training_requests set trainer_name = 'SOMEBODY ELSE' where req_no = '102/2026';
reset role;
select (select trainer_signed is null from public.training_requests where req_no = '102/2026')
       as "a different trainer named: the old trainer's signature goes";

\echo
\echo '--- 4. the signature tracker: whether and when, for User Master managers only ---'
call public.be('tsg.hr@example.com');
set role authenticated;
select (select count(*) filter (where has_signature) from public.signature_tracker() where email like 'tsg.%') = 2
   and (select count(*) from public.signature_tracker() where email like 'tsg.%') = 5
       as "2 of the 5 logins have saved one";
reset role;
call public.be('tsg.arun@example.com');
set role authenticated;
\echo '    expect ERROR below -- an engineer may not see the tracker'
select * from public.signature_tracker();
reset role;

\echo
\echo '--- 5. the signature on User Master (0455/0456, NAR-011): administrators only, every look audited, refused in Audit Mode ---'
insert into auth.users (id, email) values ('ee000454-0000-0000-0000-000000000006', 'tsg.admin@example.com') on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role) values ('ee000454-0000-0000-0000-000000000006', 'tsg.admin@example.com', 'ADMIN ONE', 'admin')
on conflict (id) do update set role = excluded.role;
call public.be('tsg.admin@example.com');
set role authenticated;
select (select signature from public.user_signature_of('ee000454-0000-0000-0000-000000000002')) = 'data:image/png;base64,ARUN'
       as "an administrator sees Arun's signature";
reset role;
select exists (select 1 from public.audit_log where action = 'signature.view' and user_id = 'ee000454-0000-0000-0000-000000000006'
                 and meta->>'user_id' = 'ee000454-0000-0000-0000-000000000002')
       as "the look is recorded: who, whose, when";
call public.be('tsg.hr@example.com');
set role authenticated;
\echo '    expect ERROR below -- editing User Master details is not enough: administrators only'
select * from public.user_signature_of('ee000454-0000-0000-0000-000000000002');
select count(*) = 0 as "...and nobody's row is readable from the table itself"
  from public.user_signatures where user_id = 'ee000454-0000-0000-0000-000000000002';
reset role;
call public.be('tsg.arun@example.com');
set role authenticated;
\echo '    expect ERROR below -- an engineer may not see anybody''s signature'
select * from public.user_signature_of('ee000454-0000-0000-0000-000000000001');
reset role;
insert into public.app_settings (key, value) values ('audit_mode', 'on') on conflict (key) do update set value = 'on';
call public.be('tsg.admin@example.com');
set role authenticated;
\echo '    expect ERROR below -- Audit Mode is on: nobody sees a signature'
select * from public.user_signature_of('ee000454-0000-0000-0000-000000000002');
reset role;
update public.app_settings set value = 'off' where key = 'audit_mode';
select not has_function_privilege('anon', 'public.user_signature_of(uuid)', 'execute') as "the public key cannot call it";

\echo
\echo '--- 6. a form from HR (0458): the Record is filled in, the plan and the evaluation stay as saved ---'
call public.be('tsg.vp@example.com');
set role authenticated;
update public.training_requests
   set topic = 'CHANGED TOPIC', trainee_name = 'CHANGED', evaluation_method = 'CHANGED', remarks = 'CHANGED',
       approved_by_name = 'CHANGED', from_date = '2026-10-01', to_date = '2026-10-03',
       record_lines = record_lines || '[{"name":"NEW PERSON","content":"Call registration","status":"Completed"}]'::jsonb
 where req_no = '102/2026';
reset role;
select (select topic <> 'CHANGED TOPIC' and trainee_name <> 'CHANGED' and evaluation_method <> 'CHANGED' and remarks <> 'CHANGED'
               and approved_by_name <> 'CHANGED'
               and from_date = '2026-10-01' and to_date = '2026-10-03'
               and record_lines @> '[{"name":"NEW PERSON","content":"Call registration"}]'
          from public.training_requests where req_no = '102/2026')
       as "the Record saved; the plan, the approval and the evaluation did not move";

\echo
\echo '--- 7. the content of training per designation: training managers only ---'
call public.be('tsg.vp@example.com');
set role authenticated;
insert into public.training_content_by_designation (designation, content) values ('  Service Engineer ', 'Call registration, visit report');
select (select designation = 'Service Engineer' and content like 'Call registration%' from public.training_content_by_designation)
       as "a training manager keeps the list; the designation is trimmed";
\echo '    expect ERROR below -- one list per designation, whatever its case'
insert into public.training_content_by_designation (designation, content) values ('SERVICE ENGINEER', 'again');
reset role;
call public.be('tsg.arun@example.com');
set role authenticated;
select count(*) = 0 as "an engineer reads no list" from public.training_content_by_designation;
\echo '    expect ERROR below -- an engineer may not keep it'
insert into public.training_content_by_designation (designation, content) values ('Hotline Engineer', 'x');
reset role;

\echo
\echo '--- 8. an administrator uploads a person''s signature (0459, NAR-012) ---'
call public.be('tsg.admin@example.com');
set role authenticated;
select public.set_user_signature('ee000454-0000-0000-0000-000000000003', 'data:image/png;base64,BALA');
reset role;
select (select signature = 'data:image/png;base64,BALA' and set_by = 'ee000454-0000-0000-0000-000000000006' and set_by_name = 'ADMIN ONE'
          from public.user_signatures where user_id = 'ee000454-0000-0000-0000-000000000003')
       as "saved for Bala, not for the administrator, and it says who uploaded it";
select exists (select 1 from public.audit_log where action = 'signature.upload' and meta->>'user_id' = 'ee000454-0000-0000-0000-000000000003')
   and exists (select 1 from public.notifications where kind = 'signature' and recipient_id = 'ee000454-0000-0000-0000-000000000003')
       as "recorded in the audit log, and Bala is told";
call public.be('tsg.bala@example.com');
set role authenticated;
update public.user_signatures set signature = 'data:image/png;base64,BALA-OWN' where user_id = 'ee000454-0000-0000-0000-000000000003';
reset role;
select (select signature = 'data:image/png;base64,BALA-OWN' and set_by is null and set_by_name = ''
          from public.user_signatures where user_id = 'ee000454-0000-0000-0000-000000000003')
       as "Bala replaces it with his own: it is his, no longer 'uploaded by'";
call public.be('tsg.hr@example.com');
set role authenticated;
\echo '    expect ERROR below -- editing User Master details is not enough: administrators only'
select public.set_user_signature('ee000454-0000-0000-0000-000000000004', 'data:image/png;base64,X');
reset role;
call public.be('tsg.admin@example.com');
set role authenticated;
\echo '    expect ERROR below -- not an image'
select public.set_user_signature('ee000454-0000-0000-0000-000000000004', 'hello');
reset role;
insert into public.app_settings (key, value) values ('audit_mode', 'on') on conflict (key) do update set value = 'on';
call public.be('tsg.admin@example.com');
set role authenticated;
\echo '    expect ERROR below -- Audit Mode is on'
select public.set_user_signature('ee000454-0000-0000-0000-000000000004', 'data:image/png;base64,X');
reset role;
update public.app_settings set value = 'off' where key = 'audit_mode';
call public.be('tsg.arun@example.com');
set role authenticated;
\echo '    expect ERROR below -- through the table a row is always the caller''s own (the stamp), so it collides with Arun''s'
insert into public.user_signatures (user_id, signature) values ('ee000454-0000-0000-0000-000000000001', 'data:image/png;base64,FORGED');
reset role;
select not exists (select 1 from public.user_signatures where user_id = 'ee000454-0000-0000-0000-000000000001')
   and (select signature from public.user_signatures where user_id = 'ee000454-0000-0000-0000-000000000002') = 'data:image/png;base64,ARUN'
       as "...nothing was written for the VP, and Arun's own is untouched";
select not has_function_privilege('anon', 'public.set_user_signature(uuid,text)', 'execute') as "the public key cannot call it";
