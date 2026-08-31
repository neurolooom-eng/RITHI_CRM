-- ===========================================================================
-- RM approval follows the reporting tree (0033_rm_approves_own_team.sql).
--   An RM approves the spares of engineers who report to them — nobody else's,
--   and never their own: a manager's request goes to THEIR manager.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com'),
 ('22222222-2222-2222-2222-222222222222','harsha@x.com'),   -- RM
 ('33333333-3333-3333-3333-333333333333','bagya@x.com'),    -- Harsha's manager
 ('44444444-4444-4444-4444-444444444444','anil@x.com');     -- reports to Harsha
insert into public.profiles (id,email,full_name,role) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','Rithi Admin','admin'),
 ('22222222-2222-2222-2222-222222222222','harsha@x.com','Harsha','rm'),
 ('33333333-3333-3333-3333-333333333333','bagya@x.com','Bagyaraj','rgm'),
 ('44444444-4444-4444-4444-444444444444','anil@x.com','Anil','engineer');
-- The reporting tree: Anil -> Harsha -> Bagyaraj.
insert into public.user_directory (name, email, reporting_manager) values
 ('Bagyaraj','bagya@x.com', ''),
 ('Harsha','harsha@x.com','Bagyaraj'),
 ('Anil','anil@x.com','Harsha'),
 ('Rithi Admin','admin@x.com','');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

insert into public.spare_requests (uid, engineer, item_status) values
 ('Q1','Anil','WARRANTY'),          -- Harsha's engineer
 ('Q2','Harsha','WARRANTY'),        -- the RM's own request
 ('Q3','Rithi Admin','WARRANTY');   -- outside Harsha's team
insert into public.spare_request_lines (request_uid, part, qty)
 values ('Q1','P-A',1),('Q2','P-B',1),('Q3','P-C',1);

\echo '--- 1. who reports to Harsha ---'
call public.be('harsha@x.com');
select public.my_dir_name() as me, public.has_reports() as is_a_manager;
select n as in_my_tree from public.visible_engineer_names() as v(n) order by 1;

\echo '--- 2. Harsha approves his own engineer: allowed ---'
select public.spare_rm_may_approve('Anil') as may_approve_anil;
update public.spare_request_lines set rm_approval='Approved', rm_by='Harsha', rm_at=now()
 where request_uid='Q1';
select request_uid, rm_approval, stage from public.spare_request_lines where request_uid='Q1';

\echo '--- 3. his OWN request is not his to approve ---'
select public.spare_rm_may_approve('Harsha') as may_approve_himself;
\echo 'expect ERROR: approving your own spare request'
update public.spare_request_lines set rm_approval='Approved', rm_by='Harsha', rm_at=now()
 where request_uid='Q2';

\echo '--- 4. nor a spare raised outside his team ---'
select public.spare_rm_may_approve('Rithi Admin') as may_approve_outsider;
\echo 'expect ERROR: not his to approve'
update public.spare_request_lines set rm_approval='Approved', rm_by='Harsha', rm_at=now()
 where request_uid='Q3';

\echo '--- 5. Harsha''s manager approves Harsha''s request ---'
call public.be('bagya@x.com');
select public.spare_rm_may_approve('Harsha') as bagyaraj_may_approve_harsha;
update public.spare_request_lines set rm_approval='Approved', rm_by='Bagyaraj', rm_at=now()
 where request_uid='Q2';
select request_uid, rm_approval, stage from public.spare_request_lines where request_uid='Q2';

\echo '--- 6. and Bagyaraj still cannot approve his own ---'
insert into public.spare_requests (uid, engineer, item_status) values ('Q4','Bagyaraj','WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty) values ('Q4','P-D',1);
\echo 'expect ERROR: his own request'
update public.spare_request_lines set rm_approval='Approved', rm_by='Bagyaraj', rm_at=now()
 where request_uid='Q4';

\echo '--- 7. an administrator is not bound by the tree ---'
call public.be('admin@x.com');
update public.spare_request_lines set rm_approval='Approved', rm_by='Rithi Admin', rm_at=now()
 where request_uid in ('Q3','Q4');
select request_uid, rm_approval from public.spare_request_lines
 where request_uid in ('Q3','Q4') order by request_uid;

-- ===========================================================================
-- Visibility (0040_spare_read_scope.sql). Not just approval: a manager must
-- not SEE requests outside their team. Superuser bypasses RLS, so each check
-- runs as `authenticated` in its own block, the way sales_contracts_test does.
-- ===========================================================================
grant select on public.harness to authenticated;
grant select on public.spare_requests, public.spare_request_lines to authenticated;

\echo '--- 8. Harsha sees his own request and his team''s — and nothing else ---'
call public.be('harsha@x.com');
do $$
declare seen text;
begin
  set local role authenticated;
  select string_agg(uid || ':' || engineer, ', ' order by uid) into seen
    from public.spare_requests;
  raise notice 'Harsha sees -> %', coalesce(seen, '(nothing)');
end $$;

\echo '--- 9. the administrator''s request (Q3) is not among them ---'
do $$
declare n int;
begin
  set local role authenticated;
  select count(*) into n from public.spare_requests where uid = 'Q3';
  raise notice 'Rithi Admin''s request visible to Harsha: % row(s)', n;
  if n <> 0 then raise exception 'LEAK: Harsha can see a request outside his team'; end if;
end $$;

\echo '--- 10. and its spares are hidden with it ---'
do $$
declare n int;
begin
  set local role authenticated;
  select count(*) into n from public.spare_request_lines where request_uid = 'Q3';
  raise notice 'Lines of Q3 visible to Harsha: % row(s)', n;
  if n <> 0 then raise exception 'LEAK: the lines outlived the hidden request'; end if;
end $$;

\echo '--- 11. Stores still sees every spare — the desks process all teams ---'
insert into auth.users (id,email) values ('55555555-5555-5555-5555-555555555555','stores@x.com');
insert into public.profiles (id,email,full_name,role)
  values ('55555555-5555-5555-5555-555555555555','Stores Sam','stores@x.com','stores_incharge');
update public.profiles set email='stores@x.com', full_name='Stores Sam'
 where id='55555555-5555-5555-5555-555555555555';
call public.be('stores@x.com');
do $$
declare n int;
begin
  set local role authenticated;
  select count(*) into n from public.spare_requests;
  raise notice 'Stores sees % request(s)', n;
  if n < 4 then raise exception 'Stores lost sight of spares it has to dispatch'; end if;
end $$;
