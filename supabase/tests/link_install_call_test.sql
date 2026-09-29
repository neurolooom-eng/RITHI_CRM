-- ===========================================================================
-- WHOEVER RAISES A MACHINE'S INSTALLATION CALL CAN MAP IT BACK (0258,
-- finding 31) — and only that.
--
-- WHAT THIS PROVES, as signed-in users (never the superuser, which ignores
-- both row-level security and EXECUTE grants):
--   1. Hotline (install.create, no cover.edit) still cannot write the warranty
--      line directly — the policy is unchanged, the UPDATE matches 0 rows;
--   2. through link_install_call it CAN put this machine's installation UCN in
--      place of the "To Check" placeholder, and a retry is a no-op;
--   3. it refuses a call that is not this machine's installation, refuses to
--      replace a call number already there, and refuses a role holding
--      neither install.create nor cover.edit;
--   4. the not-signed-in role cannot call it at all.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('02580000-0000-0000-0000-000000000001', 'hl0258@x.com'),
  ('02580000-0000-0000-0000-000000000002', 'eng0258@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('02580000-0000-0000-0000-000000000001', 'hl0258@x.com',  'HL 0258',  'hotline'),
  ('02580000-0000-0000-0000-000000000002', 'eng0258@x.com', 'ENG 0258', 'engineer')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.sale_items (uid, sa_number, product_code, product_name, serial_number, inst_call) values
  ('W-0258-A', 'SA-0258', 'ORION-G', 'Orion G', 'L0258A', 'To Check'),
  ('W-0258-B', 'SA-0258', 'ORION-G', 'Orion G', 'L0258B', ''),
  ('W-0258-C', 'SA-0258', 'ORION-G', 'Orion G', 'L0258C', '26I01I0003');
insert into public.installation_calls (ucn, call_type, reg_date, party_name, product_name, serial) values
  ('26I01I0001', 'INSTALLATION', current_date, 'P 0258', 'Orion G', 'L0258A'),
  ('26I01I0002', 'INSTALLATION', current_date, 'P 0258', 'Orion G', 'L0258B'),
  ('26I01I0004', 'INSTALLATION', current_date, 'P 0258', 'Orion G', 'L0258C');

create temp table ids as
  select uid, id from public.sale_items where uid like 'W-0258-%';
grant select on ids to authenticated;

\echo ''
\echo '--- 1. Hotline still cannot write the warranty line directly ---'
call public.be('hl0258@x.com');
set role authenticated;
do $$
declare n int;
begin
  if not public.has_perm('install.create') or public.has_perm('cover.edit') then
    raise exception 'fixture: hotline should hold install.create and not cover.edit';
  end if;
  update public.sale_items set inst_call = '26I01I0001', product_code = 'CHANGED'
   where uid = 'W-0258-A';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a direct write by Hotline changed % row(s)', n; end if;
  raise notice 'ok: direct write matched 0 rows';
end $$;

\echo ''
\echo '--- 2. through the function, the placeholder becomes the UCN; a retry is a no-op ---'
select public.link_install_call((select id from ids where uid = 'W-0258-A'), '26I01I0001');
select public.link_install_call((select id from ids where uid = 'W-0258-A'), '26I01I0001');
reset role;
do $$
declare l record;
begin
  select inst_call, product_code into l from public.sale_items where uid = 'W-0258-A';
  if l.inst_call <> '26I01I0001' then raise exception 'INST Call should be 26I01I0001, is %', l.inst_call; end if;
  if l.product_code = 'CHANGED' then raise exception 'another column was written'; end if;
  raise notice 'ok: INST Call = %', l.inst_call;
end $$;

\echo ''
\echo '--- 3. what it refuses ---'
call public.be('hl0258@x.com');
set role authenticated;
\echo 'expect ERROR: another machine''s installation call'
select public.link_install_call((select id from ids where uid = 'W-0258-B'), '26I01I0001');
\echo 'expect ERROR: already has installation call'
select public.link_install_call((select id from ids where uid = 'W-0258-C'), '26I01I0004');
reset role;

call public.be('eng0258@x.com');
set role authenticated;
\echo 'expect ERROR: RBAC, an engineer holds neither permission'
select public.link_install_call((select id from ids where uid = 'W-0258-B'), '26I01I0002');
reset role;

do $$
declare got text;
begin
  select string_agg(uid || '=' || inst_call, ', ' order by uid) into got
    from public.sale_items where uid in ('W-0258-B', 'W-0258-C');
  if got <> 'W-0258-B=, W-0258-C=26I01I0003' then
    raise exception 'a refused call changed something: %', got;
  end if;
  raise notice 'ok: %', got;
end $$;

\echo ''
\echo '--- 4. the not-signed-in role cannot call it ---'
do $$
begin
  if has_function_privilege('anon', 'public.link_install_call(bigint,text)', 'EXECUTE') then
    raise exception 'anon can execute link_install_call';
  end if;
  if not has_function_privilege('authenticated', 'public.link_install_call(bigint,text)', 'EXECUTE') then
    raise exception 'authenticated cannot execute link_install_call';
  end if;
  raise notice 'ok: anon refused, authenticated allowed';
end $$;
