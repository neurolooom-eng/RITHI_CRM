-- ===========================================================================
-- REVIEW BATCH 12, PROVED ON A DATABASE (0460-0466).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-172  a sign-in with no User Master row gets no profile (0461)
--   2. D-173  the feedback objective's evidence follows the feedback read rule (0460)
--   3. D-174  a shipment is acknowledged by the raiser, under the session's name (0462)
--   4. D-175  an FFR's number, imported marker and raiser are not the caller's (0463)
--   5. D-176  training is acknowledged by the trainee alone, and imaged (0464)
--   6. D-177  a re-load replaces the whole SI Number / transfer; D-178 imaged (0465)
--   7. D-185, D-202  two unused owner-rights functions closed to the API (0466)
--
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb12_calls', 'RB12 Calls',    '["calls.view"]'::jsonb),
 ('rb12_fb',    'RB12 Feedback', '["feedback.view"]'::jsonb),
 ('rb12_store', 'RB12 Stores',   '["calls.view", "spare.dispatch", "data.view_all"]'::jsonb),
 ('rb12_eng',   'RB12 Engineer', '["calls.view", "spare.request", "spare.receive"]'::jsonb),
 ('rb12_rm',    'RB12 RM',       '["calls.view", "ffr.manage", "ffr.view"]'::jsonb),
 ('rb12_trn',   'RB12 Trainer',  '["training.manage"]'::jsonb),
 ('rb12_imp',   'RB12 Importer', '["bulk.upload", "stock.transfer", "ffr.manage"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id, email) values
  ('0b120000-0000-0000-0000-000000000001', 'rb12-calls@x.com'),
  ('0b120000-0000-0000-0000-000000000002', 'rb12-fb@x.com'),
  ('0b120000-0000-0000-0000-000000000003', 'rb12-store@x.com'),
  ('0b120000-0000-0000-0000-000000000004', 'rb12-raiser@x.com'),
  ('0b120000-0000-0000-0000-000000000005', 'rb12-stranger@x.com'),
  ('0b120000-0000-0000-0000-000000000006', 'rb12-rm@x.com'),
  ('0b120000-0000-0000-0000-000000000007', 'rb12-trn@x.com'),
  ('0b120000-0000-0000-0000-000000000008', 'rb12-trainee@x.com'),
  ('0b120000-0000-0000-0000-000000000009', 'rb12-imp@x.com'),
  ('0b120000-0000-0000-0000-000000000010', 'rb12-imp2@x.com'),
  ('0b120000-0000-0000-0000-000000000011', 'rb12-nobody@x.com'),
  ('0b120000-0000-0000-0000-000000000012', 'rb12-listed@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b120000-0000-0000-0000-000000000001', 'rb12-calls@x.com',    'RB12 Calls',    'rb12_calls'),
  ('0b120000-0000-0000-0000-000000000002', 'rb12-fb@x.com',       'RB12 Fb',       'rb12_fb'),
  ('0b120000-0000-0000-0000-000000000003', 'rb12-store@x.com',    'RB12 Store',    'rb12_store'),
  ('0b120000-0000-0000-0000-000000000004', 'rb12-raiser@x.com',   'RB12 Raiser',   'rb12_eng'),
  ('0b120000-0000-0000-0000-000000000005', 'rb12-stranger@x.com', 'RB12 Stranger', 'rb12_eng'),
  ('0b120000-0000-0000-0000-000000000006', 'rb12-rm@x.com',       'RB12 RM',       'rb12_rm'),
  ('0b120000-0000-0000-0000-000000000007', 'rb12-trn@x.com',      'RB12 Trainer',  'rb12_trn'),
  ('0b120000-0000-0000-0000-000000000008', 'rb12-trainee@x.com',  'RB12 Trainee',  'engineer'),
  ('0b120000-0000-0000-0000-000000000009', 'rb12-imp@x.com',      'RB12 Imp',      'rb12_imp'),
  ('0b120000-0000-0000-0000-000000000010', 'rb12-imp2@x.com',     'RB12 Imp2',     'rb12_imp')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;
create temp table rb12 (what text, v text);
grant all on rb12 to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-172: a sign-in with no User Master row gets no profile ---'
-- ===========================================================================
call public.nobody();
delete from public.user_directory where email = 'rb12-listed@x.com';
insert into public.user_directory (name, email, designation) values ('RB12 Listed', 'rb12-listed@x.com', 'FSE');
call public.be('rb12-nobody@x.com');
set role authenticated;
insert into rb12 select 'unmatched profile', coalesce((public.ensure_my_profile()).role, '(none)');
insert into rb12 select 'unmatched calls.report', public.has_perm('calls.report')::text;
reset role;
call public.be('rb12-listed@x.com');
set role authenticated;
insert into rb12 select 'listed profile', coalesce((public.ensure_my_profile()).role, '(none)');
reset role;
call public.nobody();
do $$ begin
  if (select v from rb12 where what = 'unmatched profile') <> '(none)'
     or exists (select 1 from public.profiles where email = 'rb12-nobody@x.com')
     or (select v from rb12 where what = 'unmatched calls.report') <> 'false' then
    raise exception 'D-172 FAILED: a sign-in with no User Master row was given a profile or a permission';
  end if;
  if (select v from rb12 where what = 'listed profile') <> 'engineer' then
    raise exception 'D-172 FAILED: a sign-in on the User Master got no profile (%)', (select v from rb12 where what = 'listed profile');
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-173: the feedback evidence follows the feedback read rule ---'
-- ===========================================================================
call public.nobody();
delete from public.feedback where ucn = 'RB12-FB-1';
insert into public.feedback (ucn, call_number, call_type, party_name, visit_at, answers)
values ('RB12-FB-1', 'RB12-1', 'FIELD', 'RB12 SECRET PARTY', '2026-02-10 10:00+05:30',
  jsonb_build_object('INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment', 'Poor',
    'INSTALLATION/PM/FIELD-In general, support of our company for your requirements', 'Poor',
    'PM/FIELD-Ability of our Product to meet your requirement', 'Poor', 'PM/FIELD-Reliability of Product', 'Poor',
    'PM/FIELD-Reliability of Service', 'Poor', 'PM/FIELD-Promptness for Service Calls', 'Poor'));
-- The objective's id read as nobody: quality_objectives is itself row-level
-- secured, and the feedback reader holds no objective key.
insert into rb12 select 'fb objective', id::text from public.quality_objectives where calc_key = 'feedback_satisfaction' order by id limit 1;
call public.be('rb12-calls@x.com');
set role authenticated;
\echo 'expect ERROR: RBAC: you cannot read the customer feedback behind this figure'
select count(*) from public.objective_evidence((select v::bigint from rb12 where what = 'fb objective'), 3);
reset role;
call public.be('rb12-fb@x.com');
set role authenticated;
insert into rb12 select 'fb evidence', count(*)::text
  from public.objective_evidence((select v::bigint from rb12 where what = 'fb objective'), 3)
 where party_name = 'RB12 SECRET PARTY';
reset role;
call public.nobody();
do $$ begin
  if (select v from rb12 where what = 'fb evidence')::int < 1 then
    raise exception 'D-173 FAILED: a feedback.view holder could not read the feedback behind the objective';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 3. D-174: a shipment is acknowledged by its raiser, under the session name ---'
-- ===========================================================================
call public.nobody();
delete from public.spare_requests where uid = 'RB12-SR';
insert into public.spare_requests (uid, engineer, engineer_email, req_type, item_status, created_by)
values ('RB12-SR', 'RB12 Raiser', 'rb12-raiser@x.com', 'Call Based', 'WGP', '0b120000-0000-0000-0000-000000000004');
insert into public.spare_request_lines (request_uid, part, qty, row_no, rm_approval, commercial_approval, nsm_approval)
values ('RB12-SR', 'RB12-P|PART', 3, 1, 'Approved', 'Auto-Approved', 'Auto-Approved');
call public.be('rb12-store@x.com');
set role authenticated;
select public.dispatch_spare_lines(array[(select id from public.spare_request_lines where request_uid = 'RB12-SR')],
                                   array[1::numeric], array[false], 'DC-RB12', 'courier', current_date, 'part 1') is not null as dispatched;
reset role;
-- The line id read as nobody: the stranger cannot even see the line.
insert into rb12 select 'line', id::text from public.spare_request_lines where request_uid = 'RB12-SR';
call public.be('rb12-stranger@x.com');
set role authenticated;
\echo 'expect ERROR: RBAC: only the engineer who raised the request may acknowledge it'
select public.receive_spare_shipments(array[(select v::bigint from rb12 where what = 'line')], 'The Real Engineer', 'got it');
reset role;
-- the raiser, who cannot be the stranger, says the receiver is somebody else
update public.harness set uid = '0b120000-0000-0000-0000-000000000004', email = 'rb12-raiser@x.com';
set role authenticated;
insert into rb12 select 'raiser received',
  public.receive_spare_shipments(array[(select v::bigint from rb12 where what = 'line')], 'Somebody Else', 'ok')::text;
reset role;
call public.nobody();
do $$ begin
  if (select v from rb12 where what = 'raiser received') <> '1' then
    raise exception 'D-174 FAILED: the raiser could not acknowledge the shipment (%)', (select v from rb12 where what = 'raiser received');
  end if;
  if exists (select 1 from public.spare_dispatch_lines d join public.spare_request_lines l on l.id = d.line_id
              where l.request_uid = 'RB12-SR' and d.received_at is not null and d.received_by <> 'RB12 Raiser') then
    raise exception 'D-174 FAILED: the receiver named is not the session''s (%)',
      (select string_agg(d.received_by, ',') from public.spare_dispatch_lines d join public.spare_request_lines l on l.id = d.line_id where l.request_uid = 'RB12-SR');
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 4. D-175: an FFR''s number, imported marker and raiser are the database''s ---'
-- ===========================================================================
call public.nobody();
delete from public.field_failure_reports where product_serial like 'RB12-S%';
call public.be('rb12-rm@x.com');
set role authenticated;
insert into public.field_failure_reports (ffr_no, ffr_date, product_serial, customer_name, problem_reported, raised_by_name, imported_from)
values ('FFR - 001/20', '2020-01-15', 'RB12-S1', 'RB12 HOSP', 'No power', 'SOMEBODY ELSE', 'sheet');
reset role;
call public.be('rb12-imp@x.com');
set role authenticated;
-- an importer keeps the file's number and marker (the FFR Register upload)
insert into public.field_failure_reports (ffr_no, ffr_date, product_serial, customer_name, problem_reported, raised_by_name, imported_from)
values ('FFR - 777/19', '2019-03-01', 'RB12-S2', 'RB12 HOSP', 'Leak', 'THE OLD SHEET', 'Field Failure Register (sheet)');
reset role;
call public.nobody();
do $$ begin
  if exists (select 1 from public.field_failure_reports where product_serial = 'RB12-S1'
              and (ffr_no = 'FFR - 001/20' or coalesce(imported_from, '') <> '' or raised_by_name <> 'RB12 RM')) then
    raise exception 'D-175 FAILED: a direct raise kept the caller''s number, marker or name: %',
      (select ffr_no || ' / ' || coalesce(imported_from, '') || ' / ' || raised_by_name from public.field_failure_reports where product_serial = 'RB12-S1');
  end if;
  if not exists (select 1 from public.field_failure_reports where product_serial = 'RB12-S2'
                  and ffr_no = 'FFR - 777/19' and imported_from = 'Field Failure Register (sheet)') then
    raise exception 'D-175 FAILED: an importer''s FFR lost its number or marker';
  end if;
  if exists (select 1 from public.ffr_history h join public.field_failure_reports f on f.id = h.ffr_id
              where f.product_serial = 'RB12-S1' and h.action = 'create' and h.changed_by_name <> 'RB12 RM') then
    raise exception 'D-175 FAILED: the raise log names somebody other than the raiser';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 5. D-176: training is acknowledged by the trainee alone, and imaged ---'
-- ===========================================================================
call public.nobody();
delete from public.training_assignments where topic like 'RB12 %';
delete from public.user_directory where email = 'rb12-trainee@x.com';
insert into public.user_directory (name, email) values ('RB12 Trainee', 'rb12-trainee@x.com');
insert into public.training_assignments (dir_id, topic, assigned_by_name)
select id, 'RB12 SOP', 'X' from public.user_directory where email = 'rb12-trainee@x.com';
call public.be('rb12-trn@x.com');
set role authenticated;
update public.training_assignments set acknowledged_at = now() - interval '30 days' where topic = 'RB12 SOP';
reset role;
insert into rb12 select 'after trainer', coalesce(acknowledged_at::text, '(none)') from public.training_assignments where topic = 'RB12 SOP';
call public.be('rb12-trainee@x.com');
set role authenticated;
select public.acknowledge_training((select id from public.training_assignments where topic = 'RB12 SOP')) is not null as acknowledged;
reset role;
call public.nobody();
do $$ begin
  if (select v from rb12 where what = 'after trainer') <> '(none)' then
    raise exception 'D-176 FAILED: a trainer set the trainee''s acknowledgement (%)', (select v from rb12 where what = 'after trainer');
  end if;
  if (select acknowledged_at from public.training_assignments where topic = 'RB12 SOP') is null then
    raise exception 'D-176 FAILED: the trainee could not acknowledge their own training';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'training_assignments') then
    raise exception 'D-176 FAILED: training assignments are not imaged';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 6. D-177 / D-178: a re-load replaces the whole SI Number or transfer ---'
-- ===========================================================================
call public.nobody();
delete from public.stock_transfers where uid in ('RB12-T1', 'RB12-T2');
delete from public.material_returns where uid in ('RB12-SI1', 'RB12-SI2');
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date, source) values
  ('RB12-T1', 'RB12 A', 'RB12 B', '2026-01-10', 'import'),
  ('RB12-T2', 'RB12 A', 'RB12 B', '2026-01-10', '');
-- a return entered in RITHI under SI2 (its stock check lifted by name for the fixture)
alter table public.material_returns disable trigger material_returns_check_stock;
insert into public.material_returns (uid, row_no, part, engineer, good_qty, mrn_date, source)
values ('RB12-SI2', 1, 'RB12-P1|A', 'RB12 A', 1, current_date, 'app');
alter table public.material_returns enable trigger material_returns_check_stock;
delete from public.record_audit where table_name = 'stock_transfer_lines';

call public.be('rb12-imp@x.com');
set role authenticated;
select public.reload_imported_stock_lines('stl', '[{"transfer_uid":"RB12-T1","row_no":1,"part":"RB12-PA|A","qty":1},
  {"transfer_uid":"RB12-T1","row_no":2,"part":"RB12-PB|B","qty":1},{"transfer_uid":"RB12-T1","row_no":3,"part":"RB12-PC|C","qty":1}]'::jsonb);
select public.reload_imported_stock_lines('mrn', '[{"uid":"RB12-SI1","row_no":1,"part":"RB12-PA|A","engineer":"RB12 A","good_qty":1,"mrn_date":"2026-01-10"},
  {"uid":"RB12-SI1","row_no":2,"part":"RB12-PB|B","engineer":"RB12 A","good_qty":1,"mrn_date":"2026-01-10"},
  {"uid":"RB12-SI1","row_no":3,"part":"RB12-PC|C","engineer":"RB12 A","good_qty":1,"mrn_date":"2026-01-10"}]'::jsonb);
reset role;
-- the corrected files, without A, re-loaded by a SECOND importer (D-195)
call public.be('rb12-imp2@x.com');
set role authenticated;
select public.reload_imported_stock_lines('stl', '[{"transfer_uid":"RB12-T1","row_no":1,"part":"RB12-PB|B","qty":1},
  {"transfer_uid":"RB12-T1","row_no":2,"part":"RB12-PC|C","qty":2}]'::jsonb);
select public.reload_imported_stock_lines('mrn', '[{"uid":"RB12-SI1","row_no":1,"part":"RB12-PB|B","engineer":"RB12 A","good_qty":1,"mrn_date":"2026-01-10"},
  {"uid":"RB12-SI1","row_no":2,"part":"RB12-PC|C","engineer":"RB12 A","good_qty":1,"mrn_date":"2026-01-10"}]'::jsonb);
\echo 'expect ERROR: SI Number RB12-SI2 holds a return entered in RITHI; a file does not replace it'
select public.reload_imported_stock_lines('mrn', '[{"uid":"RB12-SI2","row_no":1,"part":"RB12-P9|Z","engineer":"RB12 A","good_qty":5,"mrn_date":"2026-01-10"}]'::jsonb);
\echo 'expect ERROR: Transfer RB12-T2 is not an imported transfer'
select public.reload_imported_stock_lines('stl', '[{"transfer_uid":"RB12-T2","row_no":1,"part":"RB12-PA|A","qty":9}]'::jsonb);
-- the direct-overwrite door is shut: an importer cannot edit an imported return
with u as (update public.material_returns set good_qty = 9 where uid = 'RB12-SI1' returning 1)
insert into rb12 select 'importer direct edit', count(*)::text from u;
reset role;
call public.be('rb12-calls@x.com');
set role authenticated;
\echo 'expect ERROR: RBAC: re-loading imported stock lines needs Bulk Uploads'
select public.reload_imported_stock_lines('stl', '[{"transfer_uid":"RB12-T1","row_no":1,"part":"RB12-PA|A","qty":1}]'::jsonb);
reset role;
call public.nobody();
do $$ begin
  if (select string_agg(row_no || ':' || public.part_code(part) || 'x' || qty, ' ' order by row_no)
        from public.stock_transfer_lines where transfer_uid = 'RB12-T1') is distinct from '1:RB12-PBx1 2:RB12-PCx2' then
    raise exception 'D-177 FAILED: the re-loaded transfer reads %',
      (select string_agg(row_no || ':' || public.part_code(part) || 'x' || qty, ' ' order by row_no) from public.stock_transfer_lines where transfer_uid = 'RB12-T1');
  end if;
  if (select string_agg(public.part_code(part), ' ' order by row_no) from public.material_returns where uid = 'RB12-SI1')
     is distinct from 'RB12-PB RB12-PC' then
    raise exception 'D-177 FAILED: the re-loaded SI Number reads %',
      (select string_agg(row_no || ':' || public.part_code(part), ' ' order by row_no) from public.material_returns where uid = 'RB12-SI1');
  end if;
  if (select count(*) from public.material_returns where uid = 'RB12-SI2') <> 1 then
    raise exception 'D-177 FAILED: a file touched an SI Number holding a return entered in RITHI';
  end if;
  if (select count(*) from public.stock_transfer_lines where transfer_uid = 'RB12-T2') <> 0 then
    raise exception 'D-177 FAILED: a file wrote lines to a transfer entered in RITHI';
  end if;
  if (select v from rb12 where what = 'importer direct edit') <> '0' then
    raise exception 'D-177 FAILED: an importer edited an imported return directly';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'stock_transfer_lines' and op = 'DELETE') then
    raise exception 'D-178 FAILED: a replaced transfer line left no image';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 7. D-185 / D-202: two unused owner-rights functions closed to the API ---'
-- ===========================================================================
call public.be('rb12-calls@x.com');
set role authenticated;
\echo 'expect ERROR: permission denied for function next_ffr_no'
select public.next_ffr_no(26::smallint);
reset role;
set role anon;
\echo 'expect ERROR: permission denied for function spare_request_rollup'
select public.spare_request_rollup('RB12-SR');
reset role;

call public.nobody();
