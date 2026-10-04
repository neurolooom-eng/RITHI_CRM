-- ===========================================================================
-- A person's profile, Roles & Responsibilities and training (0264), and the
-- QMS Master List key (0265).
--   The profile is seen by the person, their manager and users.manage --
--   and NOT by a colleague outside the tree.
--   A new R&R closes the one before it; a colleague cannot add one.
--   A trainee acknowledges THEIR OWN training only; the public key cannot.
--   Completion: read OR attended; a Fail keeps it open until a Pass.
--   One assignment per person per document.
--   Past training lists every session and every acknowledgement.
--   A QMS Master List re-load corrects the row by number + revision.
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('7a000000-0000-0000-0000-000000000001','tr_admin@x.com'),
 ('7a000000-0000-0000-0000-000000000002','tr_mgr@x.com'),
 ('7a000000-0000-0000-0000-000000000003','tr_eng@x.com'),
 ('7a000000-0000-0000-0000-000000000004','tr_other@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('7a000000-0000-0000-0000-000000000001','tr_admin@x.com','TR Admin','admin'),
 ('7a000000-0000-0000-0000-000000000002','tr_mgr@x.com','TR Manager','engineer'),
 ('7a000000-0000-0000-0000-000000000003','tr_eng@x.com','TR Engineer','engineer'),
 ('7a000000-0000-0000-0000-000000000004','tr_other@x.com','TR Other','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, reporting_manager, department) values
 ('TR Manager',  'tr_mgr@x.com',   '',           'Service'),
 ('TR Engineer', 'tr_eng@x.com',   'TR Manager', 'Service'),
 ('TR Other',    'tr_other@x.com', '',           'Sales');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
create or replace function pg_temp.dir(p text) returns bigint language sql as $$
  select id from public.user_directory where name = p $$;

\echo '--- 1. the admin records the engineer''s employee code and joining date ---'
call public.be('tr_admin@x.com');
begin;
  set local role authenticated;
  insert into public.user_profile (dir_id, employee_code, joining_date)
  values ((select id from public.user_directory where name = 'TR Engineer'), 'E-1001', '2024-04-01');
commit;

\echo '--- 2. who sees it: the engineer, the manager -- not a colleague ---'
\echo 'expect: tr_eng 1, tr_mgr 1, tr_other 0'
call public.be('tr_eng@x.com');
begin; set local role authenticated; select 'tr_eng' as who, count(*) from public.user_profile; rollback;
call public.be('tr_mgr@x.com');
begin; set local role authenticated; select 'tr_mgr' as who, count(*) from public.user_profile; rollback;
call public.be('tr_other@x.com');
begin; set local role authenticated; select 'tr_other' as who, count(*) from public.user_profile; rollback;

\echo '--- 3. a colleague cannot write a profile ---'
\echo 'expect ERROR: row-level security'
call public.be('tr_other@x.com');
begin;
  set local role authenticated;
  insert into public.user_profile (dir_id, employee_code) values ((select id from public.user_directory where name = 'TR Other'), 'X');
rollback;

\echo '--- 4. two R&R documents: the second CLOSES the first the day before ---'
\echo 'expect: 2026-01-01..2026-06-30, 2026-07-01..(open)'
call public.be('tr_admin@x.com');
begin;
  set local role authenticated;
  insert into public.user_rr (dir_id, url, effective_from)
  values ((select id from public.user_directory where name = 'TR Engineer'), 'https://drive/rr1', '2026-01-01');
  insert into public.user_rr (dir_id, url, effective_from)
  values ((select id from public.user_directory where name = 'TR Engineer'), 'https://drive/rr2', '2026-07-01');
commit;
select effective_from, effective_to from public.user_rr
 where dir_id = (select id from public.user_directory where name = 'TR Engineer') order by effective_from;

\echo '--- 5. ...a period that ends before it starts is refused ---'
\echo 'expect ERROR: user_rr_period'
call public.be('tr_admin@x.com');
begin;
  set local role authenticated;
  update public.user_rr set effective_to = '2025-01-01' where url = 'https://drive/rr2';
rollback;

\echo '--- 6. a colleague cannot add an R&R ---'
\echo 'expect ERROR: row-level security'
call public.be('tr_other@x.com');
begin;
  set local role authenticated;
  insert into public.user_rr (dir_id, url, effective_from)
  values ((select id from public.user_directory where name = 'TR Engineer'), 'https://drive/x', '2026-08-01');
rollback;

\echo '--- 7. a QMS document is uploaded and training assigned to the engineer and the colleague ---'
-- With its effective date: a QMS document needs one since 0368.
insert into public.documents (kind, title, doc_no, revision, effective_date, url) values ('qms', 'Service SOP', 'SOP-10', '02', '2026-08-01', 'https://drive/sop10');
call public.be('tr_admin@x.com');
begin;
  set local role authenticated;
  insert into public.training_assignments (dir_id, document_id, topic)
  select d.id, doc.id, 'SOP-10 Rev 02 Service SOP'
    from public.user_directory d, public.documents doc
   where d.name in ('TR Engineer', 'TR Other') and doc.doc_no = 'SOP-10';
commit;

\echo '--- 8. ...assigning the same document again is refused (one open item per person) ---'
\echo 'expect ERROR: training_assignments_person_topic'
call public.be('tr_admin@x.com');
begin;
  set local role authenticated;
  insert into public.training_assignments (dir_id, document_id, topic)
  select d.id, doc.id, 'again' from public.user_directory d, public.documents doc
   where d.name = 'TR Engineer' and doc.doc_no = 'SOP-10';
rollback;

\echo '--- 9. the engineer acknowledges reading it: Completed ---'
\echo 'expect: TR Engineer Completed'
call public.be('tr_eng@x.com');
begin;
  set local role authenticated;
  select public.acknowledge_training(a.id) is not null as acked
    from public.training_assignments a where a.dir_id = (select id from public.user_directory where name = 'TR Engineer');
commit;
select person, status from public.training_status where person = 'TR Engineer';

\echo '--- 10. ...and cannot acknowledge the colleague''s ---'
\echo 'expect ERROR: not assigned to you'
call public.be('tr_eng@x.com');
begin;
  set local role authenticated;
  select public.acknowledge_training((select id from public.training_assignments
                                       where dir_id = (select id from public.user_directory where name = 'TR Other')));
rollback;

\echo '--- 11. the colleague sees only their own assignment ---'
\echo 'expect: 1 row, TR Other'
call public.be('tr_other@x.com');
begin; set local role authenticated; select person from public.training_status; rollback;

\echo '--- 12. a session records a FAIL for the engineer: back to Failed - retrain ---'
\echo 'expect: TR Engineer Failed - retrain'
call public.be('tr_admin@x.com');
begin;
  set local role authenticated;
  insert into public.training_sessions (topic, document_id, session_date, trainer, method)
  select 'SOP-10 classroom', id, '2026-09-10', 'QA Lead', 'Classroom' from public.documents where doc_no = 'SOP-10';
  insert into public.training_attendance (session_id, dir_id, attended, assessment, score)
  select s.id, d.id, true, 'Fail', 40 from public.training_sessions s, public.user_directory d
   where s.topic = 'SOP-10 classroom' and d.name = 'TR Engineer';
commit;
select person, status from public.training_status where person = 'TR Engineer';

\echo '--- 13. ...a second session with a PASS completes it ---'
\echo 'expect: TR Engineer Completed, attended_on 2026-09-20'
call public.be('tr_admin@x.com');
begin;
  set local role authenticated;
  insert into public.training_sessions (topic, document_id, session_date, trainer, method, attachments)
  select 'SOP-10 retrain', id, '2026-09-20', 'QA Lead', 'Classroom', '[{"name":"attendance.pdf","url":"https://drive/att"}]'::jsonb
    from public.documents where doc_no = 'SOP-10';
  insert into public.training_attendance (session_id, dir_id, attended, assessment, score)
  select s.id, d.id, true, 'Pass', 85 from public.training_sessions s, public.user_directory d
   where s.topic = 'SOP-10 retrain' and d.name = 'TR Engineer';
commit;
select person, status, attended_on from public.training_status where person = 'TR Engineer';

\echo '--- 14. the engineer''s past training: two sessions and the acknowledgement ---'
\echo 'expect: 3 rows -- the Fail session, the Pass session and the Read & understood'
call public.be('tr_eng@x.com');
begin;
  set local role authenticated;
  select source, assessment from public.training_history order by trained_on;
rollback;

\echo '--- 15. a colleague cannot record a session ---'
\echo 'expect ERROR: row-level security'
call public.be('tr_other@x.com');
begin;
  set local role authenticated;
  insert into public.training_sessions (topic, session_date) values ('x', '2026-09-01');
rollback;

\echo '--- 16. the not-signed-in role cannot acknowledge anything ---'
\echo 'expect ERROR: permission denied for function acknowledge_training'
begin;
  set local role anon;
  select public.acknowledge_training(1);
rollback;

\echo '--- 17. the QMS Master List loaded twice: the second CORRECTS the row ---'
\echo 'expect: 1 row, title Service SOP (corrected), extra {"Owner": "QA"}'
call public.be('tr_admin@x.com');
begin;
  set local role authenticated;
  insert into public.documents (kind, title, doc_no, revision, url, extra)
  values ('qms', 'Service SOP (corrected)', ' sop-10 ', '02', 'https://drive/sop10', '{"Owner":"QA"}')
  on conflict (doc_key) do update set title = excluded.title, extra = excluded.extra;
commit;
select count(*) as rows, max(title) as title, max(extra::text) as extra from public.documents where doc_key = 'sop-10|02';

\echo '--- 18. the department list exists ---'
\echo 'expect: department'
select key from public.master_lists where key = 'department';
