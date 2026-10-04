-- ===========================================================================
-- SPARE RECYCLING, END TO END (0355).
--
--   Register a defective spare -> raise an MRS (no approval) -> Stores books
--   it out with a cost into the requester's RECYCLING hand stock -> consume
--   on the request -> other costs -> close Returned as R<PartNo>. And the
--   fences: the hand stock cannot go below nothing, a line cannot be issued
--   beyond what it asked, a closed request is fixed, nobody without a key
--   sees it, and AUDIT MODE hides it all and refuses every write.
--   Nothing in the regular spare / hand-stock tables moves.
--
-- Superuser bypasses RLS, so every step runs as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('e1e1e350-0000-0000-0000-000000000001', 'rcy_user@x.com'),
 ('e1e1e350-0000-0000-0000-000000000002', 'rcy_store@x.com'),
 ('e1e1e350-0000-0000-0000-000000000003', 'rcy_nobody@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, extra_permissions) values
 ('e1e1e350-0000-0000-0000-000000000001', 'rcy_user@x.com',   'RCY User',   'engineer',
    '["recycle.register","recycle.request","recycle.close"]'),
 ('e1e1e350-0000-0000-0000-000000000002', 'rcy_store@x.com',  'RCY Store',  'engineer', '["recycle.issue"]'),
 ('e1e1e350-0000-0000-0000-000000000003', 'rcy_nobody@x.com', 'RCY Nobody', 'engineer', '[]')
on conflict (id) do update set role = excluded.role, extra_permissions = excluded.extra_permissions;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
update public.app_settings set value = 'off' where key = 'audit_mode';

create temp table before_counts as
select (select count(*) from public.spare_consumption) as cons,
       (select count(*) from public.spare_requests) as reqs,
       (select count(*) from public.spare_dispatches) as disp;
grant select on before_counts to authenticated;

\echo '--- 1. REGISTER A DEFECTIVE SPARE ---'
call public.be('rcy_user@x.com');
begin; set local role authenticated;
  insert into public.recycle_requests (part_code, part_description, serial, qty, received_from, call_ref, rcy_no, status)
  values ('PCB-100', 'Main board', 'SN-9', 1, 'Field', '26A01F0001', 'FORGED', 'Returned');
commit;
select 'numbered RCY/YY/0001, Open, stamped',
       rcy_no = 'RCY/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '/0001'
   and status = 'Open' and created_by_name = 'RCY User' as ok
  from public.recycle_requests where part_code = 'PCB-100';

\echo '--- 2. RAISE AN MRS, NO APPROVAL ---'
begin; set local role authenticated;
  insert into public.recycle_mrs (request_id, remarks) select id, 'for the board' from public.recycle_requests where part_code = 'PCB-100';
  insert into public.recycle_mrs_lines (mrs_id, part_code, part_description, qty)
  select id, 'CAP-10', 'Capacitor', 5 from public.recycle_mrs;
commit;
select 'MRS numbered RMRS/YY/0001, for its raiser',
       mrs_no = 'RMRS/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '/0001'
   and requested_for_name = 'RCY User' as ok from public.recycle_mrs;

\echo '--- 3. ONLY STORES BOOKS IT OUT ---'
\echo 'expect ERROR: the requester has no recycle.issue'
begin; set local role authenticated;
  insert into public.recycle_issues (mrs_line_id, qty, unit_cost) select id, 1, 10 from public.recycle_mrs_lines;
commit;
call public.be('rcy_store@x.com');
begin; set local role authenticated;
  insert into public.recycle_issues (mrs_line_id, qty, unit_cost) select id, 3, 20 from public.recycle_mrs_lines;
  insert into public.recycle_issues (mrs_line_id, qty, unit_cost) select id, 2, 50 from public.recycle_mrs_lines;
commit;
\echo 'expect ERROR: nothing more can be issued (5 of 5)'
begin; set local role authenticated;
  insert into public.recycle_issues (mrs_line_id, qty, unit_cost) select id, 1, 20 from public.recycle_mrs_lines;
commit;
select 'line issued in full, cost 160', status = 'Issued' and qty_issued = 5 and cost_issued = 160 as ok
  from public.recycle_mrs_list;

\echo '--- 4. THE RECYCLING HAND STOCK, AND IT CANNOT GO BELOW NOTHING ---'
select 'requester holds 5 at an average 32', balance = 5 and avg_unit_cost = 32 as ok
  from public.recycle_hand_stock where part_code = 'CAP-10';
call public.be('rcy_user@x.com');
\echo 'expect ERROR: hand stock is 5; 6 cannot be consumed'
begin; set local role authenticated;
  insert into public.recycle_consumption (request_id, part_code, qty) select id, 'CAP-10', 6 from public.recycle_requests where part_code = 'PCB-100';
commit;
begin; set local role authenticated;
  insert into public.recycle_consumption (request_id, part_code, qty) select id, 'CAP-10', 2 from public.recycle_requests where part_code = 'PCB-100';
  insert into public.recycle_other_costs (request_id, cost_type, description, amount) select id, 'Labour', 'Rework', 100 from public.recycle_requests where part_code = 'PCB-100';
commit;
select 'balance 3 after consuming 2', balance = 3 as ok from public.recycle_hand_stock where part_code = 'CAP-10';

\echo '--- 5. CLOSING NEEDS THE JOB DONE; RETURNED AS R<PartNo> ---'
\echo 'expect ERROR: record the job done before closing'
begin; set local role authenticated;
  update public.recycle_requests set status = 'Returned' where part_code = 'PCB-100';
commit;
begin; set local role authenticated;
  update public.recycle_requests set job_done = 'Replaced two capacitors', status = 'Returned' where part_code = 'PCB-100';
commit;
select 'returned as RPCB-100, cost 64 parts + 100 other = 164',
       status = 'Returned' and returned_part_code = 'RPCB-100' and returned_qty = 1
   and parts_cost = 64 and other_cost = 100 and total_cost = 164 and issued_cost = 160 as ok
  from public.recycle_request_list where part_code = 'PCB-100';
\echo 'expect ERROR: a closed request cannot be changed'
begin; set local role authenticated;
  update public.recycle_requests set remarks = 'late edit' where part_code = 'PCB-100';
commit;
\echo 'expect ERROR: nothing more can be consumed on a closed request'
begin; set local role authenticated;
  insert into public.recycle_consumption (request_id, part_code, qty) select id, 'CAP-10', 1 from public.recycle_requests where part_code = 'PCB-100';
commit;

\echo '--- 6. NOT RECYCLABLE NEEDS A REASON ---'
begin; set local role authenticated;
  insert into public.recycle_requests (part_code, qty) values ('PSU-7', 1);
commit;
\echo 'expect ERROR: say why it is not recyclable'
begin; set local role authenticated;
  update public.recycle_requests set job_done = 'Checked', status = 'Not recyclable' where part_code = 'PSU-7';
commit;
begin; set local role authenticated;
  update public.recycle_requests set job_done = 'Checked', status = 'Not recyclable', not_recyclable_reason = 'Burnt' where part_code = 'PSU-7';
commit;
select 'not recyclable, numbered 0002, nothing returned',
       status = 'Not recyclable' and returned_part_code = '' and rcy_no like '%/0002' as ok
  from public.recycle_requests where part_code = 'PSU-7';

\echo '--- 7. NOBODY WITHOUT A KEY SEES IT ---'
call public.be('rcy_nobody@x.com');
begin; set local role authenticated;
  select 'no key sees no request' as t, count(*) = 0 as ok from public.recycle_requests;
commit;
\echo 'expect ERROR: no key may register'
begin; set local role authenticated;
  insert into public.recycle_requests (part_code) values ('X-1');
commit;

\echo '--- 8. AUDIT MODE HIDES IT ALL AND REFUSES EVERY WRITE ---'
update public.app_settings set value = 'on' where key = 'audit_mode';
call public.be('rcy_user@x.com');
begin; set local role authenticated;
  select 'audit mode: nothing visible' as t,
         (select count(*) from public.recycle_requests) = 0
     and (select count(*) from public.recycle_hand_stock) = 0
     and (select count(*) from public.recycle_mrs_list) = 0 as ok;
commit;
\echo 'expect ERROR: audit mode refuses a new request'
begin; set local role authenticated;
  insert into public.recycle_requests (part_code) values ('X-2');
commit;
update public.app_settings set value = 'off' where key = 'audit_mode';

\echo '--- 9. THE REGULAR SPARE AND HAND-STOCK TABLES DID NOT MOVE ---'
select 'regular tables untouched',
       (select count(*) from public.spare_consumption) = cons
   and (select count(*) from public.spare_requests) = reqs
   and (select count(*) from public.spare_dispatches) = disp as ok from before_counts;

-- ===========================================================================
-- 0365: START WORK + SLA, ONE REQUEST PER SPARE, IMPORT FROM MRN.
-- ===========================================================================
\echo '--- 10. A QUANTITY OF 3 IS THREE REQUESTS ---'
call public.be('rcy_user@x.com');
begin; set local role authenticated;
  select 'three numbers returned' as t,
         array_length(public.register_recycle_requests('VLV-3', 'Valve', '', 3, current_date, 'MRN 77', '', '', 'MRN-77'), 1) = 3 as ok;
commit;
select 'three open requests of one each, MRN ref kept',
       count(*) = 3 and bool_and(qty = 1) and bool_and(mrn_ref = 'MRN-77') as ok
  from public.recycle_requests where part_code = 'VLV-3';
\echo 'expect ERROR: a serial belongs to one spare'
begin; set local role authenticated;
  select public.register_recycle_requests('VLV-3', 'Valve', 'SN-1', 2, current_date, '', '', '', '');
commit;
\echo 'expect ERROR: a request is one spare (direct insert of qty 2)'
begin; set local role authenticated;
  insert into public.recycle_requests (part_code, qty) values ('VLV-9', 2);
commit;

\echo '--- 11. START WORK, ONCE; SLA = 3 WORKING DAYS, WEEKENDS SKIPPED ---'
-- The fixture is back-dated to before the Friday it is started on.
alter table public.recycle_requests disable trigger recycle_requests_guard;
update public.recycle_requests set created_at = timestamptz '2026-10-01 09:00+05:30' where part_code = 'VLV-3';
alter table public.recycle_requests enable trigger recycle_requests_guard;
select 'not started before Start Work', sla_status = 'Not started' and sla_due_at is null as ok
  from public.recycle_request_list where part_code = 'VLV-3' order by id limit 1;
begin; set local role authenticated;
  -- Friday 02-Oct-2026 10:00 IST -> due Wednesday 07-Oct-2026 10:00 IST
  select public.start_recycle_work((select min(id) from public.recycle_requests where part_code = 'VLV-3'),
                                   timestamptz '2026-10-02 10:00+05:30');
commit;
select 'due three working days later, Sat/Sun skipped',
       sla_due_at = timestamptz '2026-10-07 10:00+05:30' and work_started_by_name = 'RCY User' as ok
  from public.recycle_request_list where id = (select min(id) from public.recycle_requests where part_code = 'VLV-3');
\echo 'expect ERROR: work was already started'
begin; set local role authenticated;
  select public.start_recycle_work((select min(id) from public.recycle_requests where part_code = 'VLV-3'), now());
commit;
\echo 'expect ERROR: Start Work cannot be in the future'
begin; set local role authenticated;
  select public.start_recycle_work((select max(id) from public.recycle_requests where part_code = 'VLV-3'), now() + interval '2 days');
commit;
begin; set local role authenticated;
  update public.recycle_requests set work_started_at = now() - interval '1 day', remarks = 'tamper'
   where id = (select max(id) from public.recycle_requests where part_code = 'VLV-3');
commit;
select 'Start Work cannot be written by a plain update', work_started_at is null and remarks = 'tamper' as ok
  from public.recycle_requests where id = (select max(id) from public.recycle_requests where part_code = 'VLV-3');

\echo '--- 12. THE SLA SETTINGS: CONFIGURABLE, BY ADMIN CONFIG ONLY ---'
\echo 'expect ERROR: changing the SLA needs Admin config'
begin; set local role authenticated;
  select public.set_recycle_sla(5, array[0]);
commit;
call public.be('rcy_store@x.com');
update public.profiles set extra_permissions = extra_permissions || '["config.manage"]'::jsonb where email = 'rcy_user@x.com';
call public.be('rcy_user@x.com');
begin; set local role authenticated;
  select public.set_recycle_sla(5, array[0]);
commit;
select 'Sunday only, 5 working days: Fri 10:00 -> Thu 10:00',
       public.recycle_sla_due(timestamptz '2026-10-02 10:00+05:30') = timestamptz '2026-10-08 10:00+05:30' as ok;
begin; set local role authenticated;
  select public.set_recycle_sla(3, array[0, 6]);
commit;
\echo 'expect ERROR: at least one working day'
begin; set local role authenticated;
  select public.set_recycle_sla(3, array[0,1,2,3,4,5,6]);
commit;

\echo '--- 13. IMPORT FROM MRN: EVERY LINE WITH A QUANTITY, READ ONLY ---'
-- The regular module's own stock rule does not concern this fixture.
alter table public.material_returns disable trigger user;
insert into public.material_returns (uid, row_no, mrn_no, mrn_date, engineer, part, item_code, item_name, good_qty, defective_qty, customer_name)
values ('MRN-T1', 1, 'MRN-0099', current_date, 'SOMEONE ELSE', 'PCB-200|Board', 'PCB-200', 'Board', 1, 2, 'CUST X');
alter table public.material_returns enable trigger user;
begin; set local role authenticated;
  select 'the recycling user sees another engineer''s MRN line' as t,
         count(*) = 1 and sum(good_qty) = 1 and sum(defective_qty) = 2 as ok
    from public.recycle_mrn_lines('MRN-0099');
commit;
call public.be('rcy_nobody@x.com');
\echo 'expect ERROR: importing from MRN needs recycle.register'
begin; set local role authenticated;
  select count(*) from public.recycle_mrn_lines('');
commit;
update public.app_settings set value = 'on' where key = 'audit_mode';
call public.be('rcy_user@x.com');
\echo 'expect ERROR: not in Audit Mode'
begin; set local role authenticated;
  select count(*) from public.recycle_mrn_lines('');
commit;
update public.app_settings set value = 'off' where key = 'audit_mode';
