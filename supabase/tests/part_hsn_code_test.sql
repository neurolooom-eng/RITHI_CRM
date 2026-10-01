-- ===========================================================================
-- A part's HSN code (0309).
--   The one-time fill: "(HSN:90330000)" and "(HSN NO:...)" in a description
--   become the HSN code (as written, 7 digits too) and leave the description;
--   the rename carries every record naming the part, stock adjustments
--   included, so the engineer's balance does not split.
--   A LEGRIS-style 8-digit number with no HSN word is not touched.
--   A re-run changes nothing.
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
values ('HSN Engineer', 'HS-1|EXPIRATORY VALVE-EXT(HSN:90330000)', 4, current_date, 'HSN pool');
call public.be('hsn_admin@x.com');
begin; set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason)
  values ('HSN Engineer', 'HS-1|EXPIRATORY VALVE-EXT(HSN:90330000)', 2, 'Count found more');
commit;

\echo '--- 1. the one-time fill (the migration, run again with the fixtures in place) ---'
\i supabase/migrations/0309_part_hsn_code.sql

\echo '--- 2. HSN code lifted out as written; description cleaned; LEGRIS left alone ---'
\echo 'expect: HS-1 90330000 EXPIRATORY VALVE-EXT | HS-2 90330000 TOP JAR-ANA | HS-3 9033000 1.5BAR PRESSURE REDUCER-EXT | HS-4 (blank) LEGRIS FITTING 31930813 - ORI'
select code, hsn_code, description, item_detail from public.parts where code like 'HS-%' order by code;

\echo '--- 3. the records moved with the part: opening stock AND the stock adjustment ---'
\echo 'expect: 1 opening row and 1 adjustment on the new name, none on the old; balance 6'
select (select count(*) from public.handstock_opening where part = 'HS-1|EXPIRATORY VALVE-EXT') as opening_new,
       (select count(*) from public.handstock_adjustments where part = 'HS-1|EXPIRATORY VALVE-EXT') as adjust_new,
       (select count(*) from public.handstock_opening where part like '%HSN:%')
     + (select count(*) from public.handstock_adjustments where part like '%HSN:%') as on_old_name,
       (select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0) from public.handstock_movements
         where engineer_key = 'hsn engineer' and part_code = public.part_code('HS-1|EXPIRATORY VALVE-EXT')) as balance;

\echo '--- 4. a re-run changes nothing ---'
\i supabase/migrations/0309_part_hsn_code.sql
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

\echo '--- 8. an administrator renames through rename_part as before ---'
\echo 'expect: renamed true'
begin; set local role authenticated;
  select (public.rename_part((select id from public.parts where code = 'HS-2'), 'HS-2', 'TOP JAR - ANA')) ->> 'renamed' as renamed;
rollback;
