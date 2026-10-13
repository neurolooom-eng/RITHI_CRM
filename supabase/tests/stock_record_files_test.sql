-- ===========================================================================
-- FILES KEPT WITH A STOCK TRANSFER OR A MATERIAL RETURN (0426).
--
--   SF Eng holds a transfer (SF-T1, from them) and a return (SF-R1, theirs).
--   SF Stranger, on nobody's team, holds a return of their own (SF-R2).
--   1. SF Eng attaches a file to each of theirs; the database stamps who and
--      when, discarding what the caller sent.
--   2. SF Stranger sees none of SF Eng's files and cannot attach to their
--      records; SF Eng cannot attach to SF Stranger's return.
--   3. A file cannot be changed or removed by a signed-in user.
--   4. The public key reads nothing.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e426000-0000-0000-0000-000000000001', 'sf_eng@x.com'),
  ('0e426000-0000-0000-0000-000000000002', 'sf_stranger@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e426000-0000-0000-0000-000000000001', 'sf_eng@x.com',      'SF Eng',      'engineer'),
  ('0e426000-0000-0000-0000-000000000002', 'sf_stranger@x.com', 'SF Stranger', 'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated, anon;

delete from public.user_directory where email in ('sf_eng@x.com', 'sf_stranger@x.com', 'sf_peer@x.com');
insert into public.user_directory (name, email, reporting_manager) values
  ('SF Eng', 'sf_eng@x.com', ''), ('SF Stranger', 'sf_stranger@x.com', ''), ('SF Peer', 'sf_peer@x.com', '');

alter table public.stock_transfers disable trigger user;
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values
  ('SF-T1', 'SF Eng', 'SF Peer', date '2026-10-01');
alter table public.stock_transfers enable trigger user;
alter table public.material_returns disable trigger user;
insert into public.material_returns (uid, mrn_no, engineer, engineer_email, part, good_qty) values
  ('SF-R1', 'M-1', 'SF Eng',      'sf_eng@x.com',      'P1|Part', 1),
  ('SF-R1', 'M-1', 'SF Eng',      'sf_eng@x.com',      'P2|Part', 1),
  ('SF-R2', 'M-2', 'SF Stranger', 'sf_stranger@x.com', 'P1|Part', 1);
alter table public.material_returns enable trigger user;

\echo '--- 1. the engineer attaches to their own transfer and return; who and when are stamped ---'
call public.be('sf_eng@x.com');
set role authenticated;
insert into public.stock_record_files (kind, ref, file_name, url, attached_by_name) values
  ('stock_transfer',  'SF-T1', 'signed-mtn.pdf', 'https://drive.google.com/file/d/T1/view', 'Somebody Else'),
  ('material_return', 'SF-R1', 'signed-mrn.pdf', 'https://drive.google.com/file/d/R1/view', 'Somebody Else');
select 'both files are listed for the engineer' as t, count(*) = 2 as ok
  from public.stock_record_files where ref in ('SF-T1', 'SF-R1');
select 'stamped with the engineer, not the name the caller sent' as t,
  bool_and(attached_by = '0e426000-0000-0000-0000-000000000001' and attached_by_name = 'SF Eng') as ok
  from public.stock_record_files where ref in ('SF-T1', 'SF-R1');
select 'one file on a two-part return is one row' as t, count(*) = 1 as ok
  from public.stock_record_files where kind = 'material_return' and ref = 'SF-R1';

\echo '--- 2. nobody outside the record sees or adds to it ---'
\echo 'expect ERROR: new row violates row-level security policy for table "stock_record_files"'
insert into public.stock_record_files (kind, ref, file_name, url) values
  ('material_return', 'SF-R2', 'x.pdf', 'https://drive.google.com/file/d/X/view');
reset role;
call public.be('sf_stranger@x.com');
set role authenticated;
select 'the stranger sees none of the engineer''s files' as t,
  not exists (select 1 from public.stock_record_files where ref in ('SF-T1', 'SF-R1')) as ok;
\echo 'expect ERROR: new row violates row-level security policy for table "stock_record_files"'
insert into public.stock_record_files (kind, ref, file_name, url) values
  ('stock_transfer', 'SF-T1', 'y.pdf', 'https://drive.google.com/file/d/Y/view');
select 'but may attach to their own return' as t, true as ok;
insert into public.stock_record_files (kind, ref, file_name, url) values
  ('material_return', 'SF-R2', 'mine.pdf', 'https://drive.google.com/file/d/M/view');
select 'their own file is listed' as t, count(*) = 1 as ok
  from public.stock_record_files where ref = 'SF-R2';
reset role;

\echo '--- 3. a file is not changed or removed by a signed-in user ---'
call public.be('sf_eng@x.com');
set role authenticated;
\echo 'expect ERROR: permission denied for table stock_record_files'
update public.stock_record_files set file_name = 'renamed.pdf' where ref = 'SF-T1';
\echo 'expect ERROR: permission denied for table stock_record_files'
delete from public.stock_record_files where ref = 'SF-T1';
reset role;
select 'the transfer file is still there, unchanged' as t,
  (select file_name from public.stock_record_files where ref = 'SF-T1') = 'signed-mtn.pdf' as ok;

\echo '--- 4. the public key reads nothing ---'
update public.harness set uid = null, email = null;
set role anon;
\echo 'expect ERROR: permission denied for table stock_record_files'
select count(*) from public.stock_record_files;
reset role;

delete from public.stock_record_files where ref in ('SF-T1', 'SF-R1', 'SF-R2');
