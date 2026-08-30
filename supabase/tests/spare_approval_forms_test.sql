-- ===========================================================================
-- The Commercial and NSM approval forms (0026_spare_approval_data.sql).
--   Answers live under approval_data, gated by the stage's own permission.
--   "Admin Process in Progress" / "Put on HOLD" record why WITHOUT approving,
--   so the spare stays in that stage's queue.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('22222222-2222-2222-2222-222222222222','rm@x.com'),
 ('55555555-5555-5555-5555-555555555555','com@x.com'),
 ('66666666-6666-6666-6666-666666666666','nsm@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('22222222-2222-2222-2222-222222222222','rm@x.com','RM Ravi','rm'),
 ('55555555-5555-5555-5555-555555555555','com@x.com','Comm Cathy','commercial'),
 ('66666666-6666-6666-6666-666666666666','nsm@x.com','NSM Nita','nsm');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

insert into public.spare_requests (uid, engineer, item_status) values ('F1','E','AMC');
insert into public.spare_request_lines (request_uid, part, qty) values ('F1','P-A',1);
call public.be('rm@x.com');
update public.spare_request_lines set rm_approval='Approved', rm_by='RM', rm_at=now() where request_uid='F1';
select stage from public.spare_request_lines where request_uid='F1';

\echo '--- 1. RM cannot record a Commercial answer ---'
\echo 'expect ERROR:'
update public.spare_request_lines
   set approval_data = '{"commercial":{"status":"Cleared for Stores Processing"}}'::jsonb
 where request_uid='F1';

\echo '--- 2. Commercial records "Admin Process in Progress" — stays at Commercial ---'
call public.be('com@x.com');
update public.spare_request_lines
   set approval_data = '{"commercial":{"status":"Admin Process in Progress","pending_reason":"Invoice Pending"}}'::jsonb
 where request_uid='F1';
select stage, approval_data->'commercial'->>'pending_reason' as pending_reason
  from public.spare_request_lines where request_uid='F1';

\echo '--- 3. Commercial clears it — moves to NSM ---'
update public.spare_request_lines
   set approval_data = '{"commercial":{"status":"Cleared for Stores Processing","clearing_reason":"Under AMC","mc_sa_number":"MC2026"}}'::jsonb,
       commercial_approval='Approved', commercial_by='Comm Cathy', commercial_at=now()
 where request_uid='F1';
select stage from public.spare_request_lines where request_uid='F1';

\echo '--- 4. Commercial cannot record an NSM answer ---'
\echo 'expect ERROR:'
update public.spare_request_lines
   set approval_data = approval_data || '{"nsm":{"status":"Put on HOLD"}}'::jsonb
 where request_uid='F1';

\echo '--- 5. NSM puts it on HOLD — stays at NSM, both answers kept ---'
call public.be('nsm@x.com');
update public.spare_request_lines
   set approval_data = approval_data || '{"nsm":{"status":"Put on HOLD","reasons":["LONG PENDING"]}}'::jsonb
 where request_uid='F1';
select stage,
       approval_data->'commercial'->>'clearing_reason' as commercial,
       approval_data->'nsm'->>'status' as nsm
  from public.spare_request_lines where request_uid='F1';

\echo '--- 6. NSM clears it — on to Stores ---'
update public.spare_request_lines
   set approval_data = approval_data || '{"nsm":{"status":"Cleared for Stores Processing"}}'::jsonb,
       nsm_approval='Approved', nsm_by='NSM Nita', nsm_at=now()
 where request_uid='F1';
select stage from public.spare_request_lines where request_uid='F1';
