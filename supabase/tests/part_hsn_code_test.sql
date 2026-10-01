-- ===========================================================================
-- A part's HSN code (0309).
--   The one-time fill: "(HSN:90330000)" and "(HSN NO:...)" in a description
--   become the HSN code (as written, 7 digits too) and leave the description;
--   the rename carries every record naming the part, stock adjustments
--   included, so the engineer's balance does not split.
--   A LEGRIS-style 8-digit number with no HSN word is not touched.
--   A re-run changes nothing.
--   0310: the fill runs as NOBODY (a migration) and still renames a part that
--   sits on ANOTHER engineer's spare request, on a material return and on a
--   stock transfer -- the 17 that 0309 left on the live project -- while a
--   plain part change on that line, or an edit of that return, is still refused.
--   rename_part() still asks masters.edit.rename_part; the work behind it
--   cannot be called directly by a signed-in user or the public key.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('a5000000-0000-0000-0000-000000000001','hsn_admin@x.com'),
 ('a5000000-0000-0000-0000-000000000002','hsn_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('a5000000-0000-0000-0000-000000000001','hsn_admin@x.com','HSN Admin','admin'),
 ('a5000000-0000-0000-0000-000000000002','hsn_eng@x.com','HSN Engineer','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, validity) values ('HSN Engineer', 'hsn_eng@x.com', true);
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.parts (code, description, item_detail, category) values
 ('HS-1', 'EXPIRATORY VALVE-EXT(HSN:90330000)', 'HS-1|EXPIRATORY VALVE-EXT(HSN:90330000)', 'Spare'),
 ('HS-2', 'TOP JAR-ANA (HSN NO:90330000)',      'HS-2|TOP JAR-ANA (HSN NO:90330000)',      'Spare'),
 ('HS-3', '1.5BAR PRESSURE REDUCER-EXT(HSN:9033000)', 'HS-3|1.5BAR PRESSURE REDUCER-EXT(HSN:9033000)', 'Spare'),
 ('HS-4', 'LEGRIS FITTING 31930813 - ORI',      'HS-4|LEGRIS FITTING 31930813 - ORI',      'Spare');
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('HSN Engineer', 'HS-1|EXPIRATORY VALVE-EXT(HSN:90330000)', 1, current_date, 'HSN pool');
call public.be('hsn_admin@x.com');
begin; set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason)
  values ('HSN Engineer', 'HS-1|EXPIRATORY VALVE-EXT(HSN:90330000)', 2, 'Count found more');
commit;
-- THE THREE THAT STOPPED 0309 ON LIVE. A line on somebody else's request; a
-- material return; a transfer that, moved before the +2 adjustment, would read
-- 1 - 2 = -1 under the new name and be refused.
insert into public.spare_requests (uid, engineer) values ('SR-HS', 'Other Engineer');
insert into public.spare_request_lines (request_uid, part, qty) values ('SR-HS', 'HS-1|EXPIRATORY VALVE-EXT(HSN:90330000)', 1);
insert into public.material_returns (uid, engineer, part, good_qty, source) values ('MRN-HS', 'HSN Engineer', 'HS-1|EXPIRATORY VALVE-EXT(HSN:90330000)', 1, 'import');
insert into public.stock_transfers (uid, from_engineer, to_engineer) values ('ST-HS', 'HSN Engineer', 'Other Engineer');
insert into public.stock_transfer_lines (transfer_uid, part, qty) values ('ST-HS', 'HS-1|EXPIRATORY VALVE-EXT(HSN:90330000)', 2);
-- AS NOBODY, the way the migration runs on the live project.
update public.harness set uid = null, email = null;

\echo '--- 1. the one-time fill as finished by 0310, run as nobody with the fixtures in place ---'
\i supabase/migrations/0310_rename_passes_the_return_guard.sql

\echo '--- 2. HSN code lifted out as written; description cleaned; LEGRIS left alone ---'
\echo 'expect: HS-1 90330000 EXPIRATORY VALVE-EXT | HS-2 90330000 TOP JAR-ANA | HS-3 9033000 1.5BAR PRESSURE REDUCER-EXT | HS-4 (blank) LEGRIS FITTING 31930813 - ORI'
select code, hsn_code, description, item_detail from public.parts where code like 'HS-%' order by code;

\echo '--- 3. every record moved with the part: opening, adjustment, the other engineer''s line, the return, the transfer ---'
\echo 'expect: 1 1 1 1 1, none on the old name; balance 1 opening + 2 adjusted - 2 transferred - 1 returned = 0, the same as before the rename'
select (select count(*) from public.handstock_opening where part = 'HS-1|EXPIRATORY VALVE-EXT') as opening_new,
       (select count(*) from public.handstock_adjustments where part = 'HS-1|EXPIRATORY VALVE-EXT') as adjust_new,
       (select count(*) from public.spare_request_lines where part = 'HS-1|EXPIRATORY VALVE-EXT') as line_new,
       (select count(*) from public.material_returns where part = 'HS-1|EXPIRATORY VALVE-EXT') as return_new,
       (select count(*) from public.stock_transfer_lines where part = 'HS-1|EXPIRATORY VALVE-EXT') as transfer_new,
       (select count(*) from public.handstock_opening where part like '%HSN:%')
     + (select count(*) from public.handstock_adjustments where part like '%HSN:%')
     + (select count(*) from public.spare_request_lines where part like '%HSN:%')
     + (select count(*) from public.material_returns where part like '%HSN:%')
     + (select count(*) from public.stock_transfer_lines where part like '%HSN:%') as on_old_name,
       (select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0) from public.handstock_movements
         where engineer_key = 'hsn engineer' and part_code = public.part_code('HS-1|EXPIRATORY VALVE-EXT')) as balance;

\echo '--- 4. a re-run changes nothing ---'
\i supabase/migrations/0310_rename_passes_the_return_guard.sql
\echo 'expect: same four rows as step 2'
select code, hsn_code, description from public.parts where code like 'HS-%' order by code;

\echo '--- 5. the impact preview counts stock adjustments ---'
\echo 'expect: a Stock adjustments row with 1'
select relation, rows from public.part_rename_impact('HS-1|EXPIRATORY VALVE-EXT') where relation = 'Stock adjustments';

\echo '--- 6. an engineer still cannot rename a part ---'
\echo 'expect ERROR: RBAC: only a role that maintains the masters may rename a part'
call public.be('hsn_eng@x.com');
begin; set local role authenticated;
  select public.rename_part((select id from public.parts where code = 'HS-2'), 'HS-2', 'TOP JAR');
rollback;

\echo '--- 7. nobody signed in can call the work behind it directly ---'
\echo 'expect ERROR: permission denied for function rename_part_records (authenticated)'
call public.be('hsn_admin@x.com');
begin; set local role authenticated;
  select public.rename_part_records((select id from public.parts where code = 'HS-2'), 'HS-2', 'TOP JAR');
rollback;
\echo 'expect ERROR: permission denied for function rename_part_records (anon)'
begin; set local role anon;
  select public.rename_part_records(1, 'X', 'Y');
rollback;

\echo '--- 7b. the guards still refuse a change that is not a rename ---'
-- AS A SIGNED-IN ENGINEER WHO DID NOT RAISE IT, BUT OUTSIDE RLS (no `set
-- role`), so the line is reached and only the GUARD can refuse it. Under RLS
-- the engineer cannot see another's line, the UPDATE matches nothing and this
-- passes with the guard removed; as nobody, the guard's test is NULL and lets
-- it through (0310's header) -- either way the check would prove nothing.
\echo 'expect ERROR: RBAC: only the engineer who raised the request may change its parts'
call public.be('hsn_eng@x.com');
begin;
  update public.spare_request_lines set part = 'HS-2|TOP JAR-ANA' where request_uid = 'SR-HS';
rollback;
\echo 'expect ERROR: A material return cannot be edited'
update public.harness set uid = null, email = null;
begin;
  update public.material_returns set good_qty = 5 where uid = 'MRN-HS';
rollback;
\echo 'expect ERROR: A material return cannot be edited (a part change with no rename ticket)'
begin;
  update public.material_returns set part = 'HS-2|TOP JAR-ANA' where uid = 'MRN-HS';
rollback;

\echo '--- 7c. a NON-administrator holding masters.edit.rename_part renames a part on SOMEBODY ELSE''s request ---'
-- Before 0310 the line guard refused this ("only the engineer who raised the
-- request may change its parts"): the rename ticket is what lets it through.
insert into public.app_roles (role, label, permissions)
values ('hsn_renamer', 'HSN Renamer', '["masters.edit.rename_part", "masters.edit.records"]')
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id,email) values ('a5000000-0000-0000-0000-000000000003','hsn_renamer@x.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values ('a5000000-0000-0000-0000-000000000003','hsn_renamer@x.com','HSN Renamer','hsn_renamer')
on conflict (id) do update set role = excluded.role;
\echo 'expect: renamed true; the other engineer''s line now reads HS-1|EXPIRATORY VALVE - EXT'
call public.be('hsn_renamer@x.com');
begin;
  select (public.rename_part((select id from public.parts where code = 'HS-1'), 'HS-1', 'EXPIRATORY VALVE - EXT')) ->> 'renamed' as renamed;
  select part from public.spare_request_lines where request_uid = 'SR-HS';
rollback;

\echo '--- 8. an administrator renames through rename_part as before ---'
call public.be('hsn_admin@x.com');
\echo 'expect: renamed true'
begin; set local role authenticated;
  select (public.rename_part((select id from public.parts where code = 'HS-2'), 'HS-2', 'TOP JAR - ANA')) ->> 'renamed' as renamed;
rollback;
