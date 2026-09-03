-- ===========================================================================
-- A spare line whose request is in neither export (0087 + 0084).
--   The stub parent a BEFORE trigger creates is invisible to the very command
--   that is inserting the line, so the row-level check must not depend on
--   seeing it. An admin gets through; a non-admin still cannot attach lines to
--   someone else's request.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com'),
 ('22222222-2222-2222-2222-222222222222','eng@x.com'),
 ('33333333-3333-3333-3333-333333333333','other@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','Rithi Admin','admin'),
 ('22222222-2222-2222-2222-222222222222','eng@x.com','Eng Ravi','engineer'),
 ('33333333-3333-3333-3333-333333333333','other@x.com','Eng Other','engineer');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

\echo '--- 1. ADMIN: a line whose OR number is in neither file loads, on a stub ---'
call public.be('admin@x.com');
set role authenticated;
insert into public.spare_request_lines (line_uid, request_uid, part, qty)
values ('OR26724|NO-001','OR26724','NO-001|NONE',1);
reset role;
select l.line_uid, l.request_uid, r.status, left(r.remarks, 22) as stub_remark
  from public.spare_request_lines l join public.spare_requests r on r.uid = l.request_uid;

\echo '--- 2. ADMIN: and a line on a request that IS here still loads ---'
call public.be('admin@x.com');
insert into public.spare_requests (uid, or_no, engineer) values ('OR43016','OR43016','MEGHANATH');
set role authenticated;
insert into public.spare_request_lines (line_uid, request_uid, part, qty)
values ('OR43016|MP-010','OR43016','MP-010|SENSOR',2);
reset role;
select count(*) as lines_now from public.spare_request_lines;

\echo '--- 3. an engineer may put lines on their OWN request ---'
call public.be('eng@x.com');
set role authenticated;
insert into public.spare_requests (uid, engineer) values ('MINE','Eng Ravi');
insert into public.spare_request_lines (line_uid, request_uid, part, qty)
values ('MINE-01','MINE','P-A',1);
reset role;
select line_uid from public.spare_request_lines where request_uid='MINE';

\echo '--- 4. but NOT on someone else''s request (expect ERROR) ---'
call public.be('other@x.com');
set role authenticated;
insert into public.spare_request_lines (line_uid, request_uid, part, qty)
values ('MINE-02','MINE','P-B',1);
reset role;

\echo '--- 5. nor conjure one out of a stub (expect ERROR) ---'
call public.be('other@x.com');
set role authenticated;
insert into public.spare_request_lines (line_uid, request_uid, part, qty)
values ('GHOST-01','OR99999','P-C',1);
reset role;
select count(*) as still_three from public.spare_request_lines;
