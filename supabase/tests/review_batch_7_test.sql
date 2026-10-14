-- ===========================================================================
-- REVIEW BATCH 7, PROVED ON A DATABASE (0392-0393).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-041  who approved / dispatched / received a spare is the session (0393)
--   2. D-044  a stock transfer, a material return and a spare request are saved
--             whole or not at all (0392)
--
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb7_eng',    'RB7 Engineer', '["calls.view", "spare.request", "stock.transfer", "stock.return"]'::jsonb),
 ('rb7_loader', 'RB7 Loader',   '["calls.view", "bulk.upload", "spare.approve_rm"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b770000-0000-0000-0000-000000000001', 'rb7-eng@x.com'),
  ('0b770000-0000-0000-0000-000000000002', 'rb7-rm@x.com'),
  ('0b770000-0000-0000-0000-000000000003', 'rb7-loader@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b770000-0000-0000-0000-000000000001', 'rb7-eng@x.com',    'RB7 Eng',    'rb7_eng'),
  ('0b770000-0000-0000-0000-000000000002', 'rb7-rm@x.com',     'RB7 RM',     'rm'),
  ('0b770000-0000-0000-0000-000000000003', 'rb7-loader@x.com', 'RB7 Loader', 'rb7_loader')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
delete from public.user_directory where name like 'RB7 %';
insert into public.user_directory (name, email) values
  ('RB7 Eng', 'rb7-eng@x.com'), ('RB7 Other', 'rb7-other@x.com');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-041: the name on an approval is the session''s ---'
-- ===========================================================================
call public.nobody();
delete from public.spare_requests where uid like 'RB7-%';
insert into public.spare_requests (uid, engineer, engineer_email, item_status) values
  ('RB7-R1', 'RB7 Eng', 'rb7-eng@x.com', 'WARRANTY'),
  ('RB7-R2', 'RB7 Eng', 'rb7-eng@x.com', 'WARRANTY');
insert into public.spare_request_lines (request_uid, row_no, part, qty) values
  ('RB7-R1', 1, 'RB7-P', 1), ('RB7-R1', 2, 'RB7-Q', 1), ('RB7-R2', 1, 'RB7-P', 1);

-- The RM's screen sends somebody else's name; the database writes the RM's.
call public.be('rb7-rm@x.com');
update public.spare_request_lines
   set rm_approval = 'Approved', rm_by = 'SOMEBODY ELSE', rm_at = now(),
       commercial_approval = 'Auto-Approved', nsm_approval = 'Auto-Approved'
 where request_uid = 'RB7-R1' and row_no = 1;
-- An importer loads history as it was.
call public.be('rb7-loader@x.com');
update public.spare_request_lines
   set rm_approval = 'Approved', rm_by = 'HISTORIC RM', rm_at = now()
 where request_uid = 'RB7-R2' and row_no = 1;
call public.nobody();
do $$ begin
  if (select rm_by from public.spare_request_lines where request_uid = 'RB7-R1' and row_no = 1) is distinct from 'RB7 RM' then
    raise exception 'D-041 FAILED: the approver is %, not the session',
      (select rm_by from public.spare_request_lines where request_uid = 'RB7-R1' and row_no = 1);
  end if;
  if (select coalesce(commercial_by, '') from public.spare_request_lines where request_uid = 'RB7-R1' and row_no = 1) <> '' then
    raise exception 'D-041 FAILED: an Auto-Approved stage was given a name';
  end if;
  if (select rm_by from public.spare_request_lines where request_uid = 'RB7-R2' and row_no = 1) is distinct from 'HISTORIC RM' then
    raise exception 'D-041 FAILED: an import''s historic name was overwritten';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-044: saved whole, or not at all ---'
-- ===========================================================================
call public.nobody();
delete from public.stock_transfers where from_engineer = 'RB7 Eng';
delete from public.material_returns where engineer = 'RB7 Eng';
delete from public.handstock_opening where engineer = 'RB7 Eng';
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('RB7 Eng', 'KY550200|MOTHER BOARD - OSIRIS 3', 5, current_date - 1, 'test');

call public.be('rb7-eng@x.com');
set role authenticated;
\echo 'expect ERROR: new row for relation "stock_transfer_lines" violates check constraint "stock_transfer_lines_qty_check"'
select public.save_stock_transfer(
  jsonb_build_object('from_engineer', 'RB7 Eng', 'to_engineer', 'RB7 Other', 'remarks', 'RB7 broken'),
  jsonb_build_array(jsonb_build_object('part', 'KY550200|MOTHER BOARD - OSIRIS 3', 'qty', 1),
                    jsonb_build_object('part', 'KY550200|MOTHER BOARD - OSIRIS 3', 'qty', 0)));
select public.save_stock_transfer(
  jsonb_build_object('from_engineer', 'RB7 Eng', 'to_engineer', 'RB7 Other', 'remarks', 'RB7 whole'),
  jsonb_build_array(jsonb_build_object('part', 'KY550200|MOTHER BOARD - OSIRIS 3', 'qty', 1, 'reason', 'covering')));

\echo 'expect ERROR: has ... in hand (the second line is more than the engineer holds)'
select public.save_material_return(
  jsonb_build_object('mrn_no', 'RB7-M1', 'mrn_date', current_date, 'engineer', 'RB7 Eng', 'engineer_email', 'rb7-eng@x.com', 'remarks', 'RB7 broken'),
  jsonb_build_array(jsonb_build_object('part', 'KY550200|MOTHER BOARD - OSIRIS 3', 'good_qty', 1, 'defective_qty', 0),
                    jsonb_build_object('part', 'KY550200|MOTHER BOARD - OSIRIS 3', 'good_qty', 50, 'defective_qty', 0)));
select public.save_material_return(
  jsonb_build_object('mrn_no', 'RB7-M2', 'mrn_date', current_date, 'engineer', 'RB7 Eng', 'engineer_email', 'rb7-eng@x.com', 'remarks', 'RB7 whole'),
  jsonb_build_array(jsonb_build_object('part', 'KY550200|MOTHER BOARD - OSIRIS 3', 'good_qty', 1, 'defective_qty', 0),
                    jsonb_build_object('part', 'KY550200|MOTHER BOARD - OSIRIS 3', 'good_qty', 0, 'defective_qty', 1)));

\echo 'expect ERROR: invalid input syntax (a line that cannot be read, after the request was written)'
select public.save_spare_request(
  jsonb_build_object('req_type', 'HandStock', 'engineer', 'RB7 Eng', 'engineer_email', 'rb7-eng@x.com', 'handstock_reason', 'RB7 broken'),
  jsonb_build_array(jsonb_build_object('part', 'RB7-P', 'qty', 1), jsonb_build_object('part', 'RB7-Q', 'qty', 'two')));
select public.save_spare_request(
  jsonb_build_object('req_type', 'HandStock', 'engineer', 'RB7 Eng', 'engineer_email', 'rb7-eng@x.com', 'handstock_reason', 'RB7 whole'),
  jsonb_build_array(jsonb_build_object('part', 'RB7-P', 'qty', 1), jsonb_build_object('part', 'RB7-Q', 'qty', 2)));
reset role;
call public.nobody();

do $$ begin
  if exists (select 1 from public.stock_transfers where remarks = 'RB7 broken') then
    raise exception 'D-044 FAILED: a refused transfer left its header';
  end if;
  if (select count(*) from public.stock_transfer_lines l join public.stock_transfers t on t.uid = l.transfer_uid
       where t.remarks = 'RB7 whole') <> 1 then
    raise exception 'D-044 FAILED: the whole transfer was not saved with its line';
  end if;
  if exists (select 1 from public.material_returns where mrn_no = 'RB7-M1') then
    raise exception 'D-044 FAILED: a refused return left its first row';
  end if;
  if (select count(distinct uid) || '/' || count(*) from public.material_returns where mrn_no = 'RB7-M2') <> '1/2' then
    raise exception 'D-044 FAILED: the whole return was not saved as one uid with two rows';
  end if;
  if exists (select 1 from public.spare_requests where handstock_reason = 'RB7 broken') then
    raise exception 'D-044 FAILED: a refused spare request left its header';
  end if;
  if (select count(*) from public.spare_request_lines l join public.spare_requests r on r.uid = l.request_uid
       where r.handstock_reason = 'RB7 whole') <> 2
     or (select coalesce(or_no, '') from public.spare_requests where handstock_reason = 'RB7 whole') = '' then
    raise exception 'D-044 FAILED: the whole spare request was not saved with its lines and OR number';
  end if;
end $$;

call public.nobody();
