-- ===========================================================================
-- Changing the engineer on a spare request (0100).
--   Before dispatch, an administrator may move it, and the move is logged.
--   After dispatch nobody may, because hand stock is DERIVED from the request:
--   the name would move somebody else's parts, silently.
-- Superuser bypasses RLS, so each check runs as `authenticated` in its own
-- block. Run after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('a1a1a1a1-0000-0000-0000-000000000001','boss@x.com'),
 ('a1a1a1a1-0000-0000-0000-000000000002','ravi@x.com'),
 ('a1a1a1a1-0000-0000-0000-000000000003','meena@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('a1a1a1a1-0000-0000-0000-000000000001','boss@x.com','Admin Boss','admin'),
 ('a1a1a1a1-0000-0000-0000-000000000002','ravi@x.com','Ravi Kumar','engineer'),
 ('a1a1a1a1-0000-0000-0000-000000000003','meena@x.com','Meena Rao','engineer');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

-- RA1 is still paper. RA2 has gone out.
insert into public.spare_requests (uid, or_no, engineer, engineer_email, req_type, item_status) values
 ('RA1','OR-TEST-0001','Ravi Kumar','ravi@x.com','HandStock','WARRANTY'),
 ('RA2','OR-TEST-0002','Ravi Kumar','ravi@x.com','HandStock','WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty) values
 ('RA1','RA-1|Pump',3), ('RA2','RA-2|Valve',4);
update public.spare_request_lines
   set stores_status='Dispatched', dispatched_qty=4, dc_number='SO-RA2', dispatched_at=now()
 where request_uid = 'RA2';

grant select on public.harness to authenticated;
grant select on public.spare_requests, public.spare_request_lines to authenticated;

\echo '--- 1. RA1 is not dispatched; RA2 is ---'
\echo 'expect: f then t'
select public.spare_request_is_dispatched('RA1'), public.spare_request_is_dispatched('RA2');

\echo '--- 2. an engineer cannot move their own request (expect ERROR) ---'
call public.be('ravi@x.com');
do $$ begin
  set local role authenticated;
  perform public.reassign_spare_request('RA1','Meena Rao','meena@x.com','trying it on');
end $$;

\echo '--- 3. an administrator can, before dispatch ---'
\echo 'expect: Meena Rao / meena@x.com'
call public.be('boss@x.com');
do $$ begin
  set local role authenticated;
  perform public.reassign_spare_request('RA1','Meena Rao','','on leave — Meena is covering');
end $$;
select engineer, engineer_email from public.spare_requests where uid = 'RA1';

\echo '--- 4. ...and the address is looked up when it is not given ---'
\echo 'expect: the log row, from Ravi to Meena, with the reason and who did it'
select from_engineer, from_email, to_engineer, to_email, reason, changed_by_name
  from public.spare_request_engineer_log where request_uid = 'RA1';

\echo '--- 5. moving it to where it already is changes nothing and logs nothing ---'
\echo 'expect: still 1 log row'
do $$ begin
  set local role authenticated;
  perform public.reassign_spare_request('RA1','Meena Rao','meena@x.com','again');
end $$;
select count(*) as log_rows from public.spare_request_engineer_log where request_uid = 'RA1';

\echo '--- 6. a dispatched request cannot be moved, even by an administrator (expect ERROR) ---'
do $$ begin
  set local role authenticated;
  perform public.reassign_spare_request('RA2','Meena Rao','meena@x.com','too late');
end $$;

\echo '--- 7. nor by writing the table directly, which is the way round it (expect ERROR) ---'
update public.spare_requests set engineer = 'Meena Rao' where uid = 'RA2';

\echo '--- 8. the guard is about the ENGINEER, not the row: other edits still work ---'
\echo 'expect: UPDATE 1'
update public.spare_requests set remarks = 'still editable' where uid = 'RA2';

\echo '--- 9. Ravi can read the log of the request taken off him ---'
\echo 'expect: 1 row — a reassignment is not a secret from the person it moved it away from'
call public.be('ravi@x.com');
do $$
declare n int;
begin
  set local role authenticated;
  select count(*) into n from public.spare_request_engineer_log;
  raise notice 'rows Ravi can see: %', n;
end $$;

\echo '--- 10. an unrelated engineer sees none of it ---'
\echo 'expect: 0'
call public.be('meena@x.com');
insert into auth.users (id,email) values ('a1a1a1a1-0000-0000-0000-000000000004','stranger@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('a1a1a1a1-0000-0000-0000-000000000004','stranger@x.com','A Stranger','engineer');
call public.be('stranger@x.com');
do $$
declare n int;
begin
  set local role authenticated;
  select count(*) into n from public.spare_request_engineer_log;
  raise notice 'rows a stranger can see: %', n;
end $$;

\echo '--- 11. cleanup ---'
delete from public.spare_request_lines where request_uid in ('RA1','RA2');
delete from public.spare_requests where uid in ('RA1','RA2');
delete from public.profiles where email in ('boss@x.com','ravi@x.com','meena@x.com','stranger@x.com');
