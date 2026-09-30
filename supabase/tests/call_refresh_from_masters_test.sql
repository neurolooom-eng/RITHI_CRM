-- ===========================================================================
-- A call's Party and Product details refreshed from the masters (0271).
--   Party: City / State from the Party Master; a party it lacks is left alone.
--   Product: cover AS ON THE REGISTRATION DATE --
--     warranty running -> WGP, with the contract running beside it written too;
--     only a contract running -> its type (AMC);
--     nothing running -> the last ones that had ENDED, and OGP.
--   A Solved call is refreshed too (any status).
--   Not while Audit Mode is ON; not without calls.edit / calls.edit.customer;
--   not by the public key.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('c7000000-0000-0000-0000-000000000001','cr_admin@x.com'),
 ('c7000000-0000-0000-0000-000000000002','cr_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('c7000000-0000-0000-0000-000000000001','cr_admin@x.com','CR Admin','admin'),
 ('c7000000-0000-0000-0000-000000000002','cr_eng@x.com','CR Engineer','engineer')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.parties (party_name, city, state) values ('CR HOSPITAL', 'Pune', 'Maharashtra');

-- The machine VEGA / CR1: warranty 2024-01-01..2024-12-31, AMC 2024-06-01..2025-12-31, then nothing.
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end)
values ('SA-CR-1', 'CR HOSPITAL', '2024-01-01', '2024-12-31');
insert into public.sale_items (sa_number, product_code, product_name, serial_number)
values ('SA-CR-1', 'VEGA', 'VEGA', 'CR1');
insert into public.contract_entries (mc_number, party_name, contract_start, contract_end, contract_type)
values ('MC-CR-1', 'CR HOSPITAL', '2024-06-01', '2025-12-31', 'Labour');
insert into public.contract_items (mc_number, product_code, product_name, serial_number)
values ('MC-CR-1', 'VEGA', 'VEGA', 'CR1');

-- Four calls on that machine, registered on different dates, all with stale values.
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, complaint_date,
                                party_name, city, state, item_status, warranty_number, allocated_to)
values
 ('CR-1', 'C-CR1', 'FIELD', 'VEGA', 'CR1', '2024-03-01', '2024-03-01', 'CR HOSPITAL', 'old', 'old', 'OGP', 'stale', 'E'),
 ('CR-2', 'C-CR2', 'FIELD', 'VEGA', 'CR1', '2024-08-01', '2024-08-01', 'CR HOSPITAL', '', '', 'OGP', '', 'E'),
 ('CR-3', 'C-CR3', 'FIELD', 'VEGA', 'CR1', '2025-03-01', '2025-03-01', 'CR HOSPITAL', '', '', 'OGP', '', 'E'),
 ('CR-4', 'C-CR4', 'FIELD', 'VEGA', 'CR1', '2026-03-01', '2026-03-01', 'NOT IN MASTER', 'Keep', 'Keep', 'AMC', '', 'E');

\echo '--- 1. party details: City / State from the Party Master; a party it lacks is left alone ---'
\echo 'expect: {"updated": 3, "unmatched": 1}; CR-1 Pune/Maharashtra; CR-4 Keep/Keep'
call public.be('cr_admin@x.com');
begin; set local role authenticated;
  select public.refresh_calls_party(array['CR-1','CR-2','CR-3','CR-4']) as result;
commit;
select ucn, city, state from public.calls where ucn in ('CR-1','CR-4') order by ucn;

\echo '--- 2. product details as on each registration date ---'
\echo 'expect: CR-1 SA-CR-1 / no running contract (none started yet: blank) / WGP'
\echo '        CR-2 SA-CR-1 + MC-CR-1 Labour / WGP (warranty decides)'
\echo '        CR-3 last warranty SA-CR-1 + MC-CR-1 / AMC'
\echo '        CR-4 last warranty SA-CR-1 + last contract MC-CR-1 / OGP'
call public.be('cr_admin@x.com');
begin; set local role authenticated;
  select public.refresh_calls_product(array['CR-1','CR-2','CR-3','CR-4']) as result;
commit;
select ucn, warranty_number, warranty_end, contract_number, contract_end, contract_type, item_status
  from public.calls where ucn like 'CR-%' order by ucn;

\echo '--- 3. run again: nothing left to change ---'
\echo 'expect: {"updated": 0}'
call public.be('cr_admin@x.com');
begin; set local role authenticated;
  select public.refresh_calls_product(array['CR-1','CR-2','CR-3','CR-4']) as result;
commit;

\echo '--- 4. a SOLVED call is refreshed too ---'
\echo 'expect: {"updated": 1, "unmatched": 0}'
update public.field_calls set status = 'Solved', last_status = 'Solved', city = 'x' where ucn = 'CR-2';
call public.be('cr_admin@x.com');
begin; set local role authenticated;
  select public.refresh_calls_party(array['CR-2']) as result;
commit;

\echo '--- 5. an engineer without the edit rights is refused ---'
\echo 'expect ERROR: RBAC'
call public.be('cr_eng@x.com');
begin; set local role authenticated;
  select public.refresh_calls_party(array['CR-1']);
rollback;

\echo '--- 6. with Audit Mode ON both are refused, even for an administrator ---'
\echo 'expect ERROR: Audit Mode is ON (party)'
call public.be('cr_admin@x.com');
begin; set local role authenticated;
  select public.set_audit_mode(true, 'test audit');
  select public.refresh_calls_party(array['CR-1']);
rollback;
\echo 'expect ERROR: Audit Mode is ON (product)'
begin; set local role authenticated;
  select public.set_audit_mode(true, 'test audit');
  select public.refresh_calls_product(array['CR-1']);
rollback;

\echo '--- 7. the public key cannot call either ---'
\echo 'expect ERROR: permission denied for function refresh_calls_party'
begin; set local role anon;
  select public.refresh_calls_party(array['CR-1']);
rollback;
