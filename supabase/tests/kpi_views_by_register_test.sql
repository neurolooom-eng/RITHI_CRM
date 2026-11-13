-- ===========================================================================
-- KPI & FAILURE ANALYSIS BY CALL TYPE (0474).
--   The four KPI views say which register each call is on -- the TABLE it was
--   read from, never the Call Type text -- and the three registers add up to
--   what the views counted before:
--     * failure_rate_by_product: one row per product, its existing counts the
--       sum of the field_ / installation_ / pm_ ones;
--     * failure_modes_by_product and spare_usage_rollup: a row per register;
--     * a Field call whose Call Type text is not "FIELD ..." still counts
--       under Field: the table decides, not the text.
--   Read as a signed-in engineer, the counts are that engineer's calls only.
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e474000-0000-0000-0000-000000000001', 'kr_admin@x.com'),
  ('0e474000-0000-0000-0000-000000000002', 'kr_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e474000-0000-0000-0000-000000000001', 'kr_admin@x.com', 'KR Admin', 'admin'),
  ('0e474000-0000-0000-0000-000000000002', 'kr_eng@x.com',   'KR Eng',   'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
delete from public.user_directory where email in ('kr_eng@x.com', 'kr_other@x.com');
insert into public.user_directory (name, email, reporting_manager, region) values
  ('KR Eng', 'kr_eng@x.com', '', 'South'), ('KR Other', 'kr_other@x.com', '', 'North');

alter table public.field_calls disable trigger user;
alter table public.installation_calls disable trigger user;
alter table public.pm_calls disable trigger user;
alter table public.products disable trigger user;
-- KRPROD: 4 machines; 2 Field calls (one typed "BREAKDOWN", not "FIELD"), 1
-- Installation call, 1 PM call. KR Eng is allotted the first Field call only.
insert into public.products (item_name, serial_number) select 'KRPROD', 'KRS' || g from generate_series(1, 4) g;
insert into public.field_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, standard_complaint, allocated_to, item_status) values
  ('KR-F1', 'KF1', 'FIELD CALL',   current_date - 5, 'KRPROD', 'KRS1', 'P', 'NO DISPLAY', 'KR Eng',   'WGP'),
  ('KR-F2', 'KF2', 'BREAKDOWN',    current_date - 5, 'KRPROD', 'KRS2', 'P', 'NO DISPLAY', 'KR Other', 'OGP');
insert into public.installation_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, standard_complaint, allocated_to, item_status) values
  ('KR-I1', 'KI1', 'INSTALLATION', current_date - 5, 'KRPROD', 'KRS3', 'P', 'INSTALLATION', 'KR Other', 'WGP');
insert into public.pm_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, standard_complaint, allocated_to, item_status) values
  ('KR-P1', 'KP1', 'PM CALL', current_date - 5, 'KRPROD', 'KRS4', 'P', 'PM', 'KR Other', 'AMC');
alter table public.field_calls enable trigger user;
alter table public.installation_calls enable trigger user;
alter table public.pm_calls enable trigger user;
alter table public.products enable trigger user;
insert into public.parts (code, description, item_detail, category) values ('KR-PT', 'KR PART', 'KR-PT|KR PART', 'Spare') on conflict do nothing;
alter table public.spare_consumption disable trigger user;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer) values
  ('KR-F1', 'KF1', 'KR-PT|KR PART', 2, 'KR Eng'),
  ('KR-F2', 'KF2', 'KR-PT|KR PART', 1, 'KR Other'),
  ('KR-P1', 'KP1', 'KR-PT|KR PART', 3, 'KR Other');
alter table public.spare_consumption enable trigger user;

\echo '--- 1. failure rate: one row, the registers add up to the total ---'
\echo 'expect: 1 row | 4 machines | 4 calls = 2 Field + 1 Installation + 1 PM | per 100 = 100.0'
call public.be('kr_admin@x.com');
begin; set local role authenticated;
  select count(*) as rows, max(machines) as machines, max(calls_12m) as calls_12m,
         max(field_12m) as field, max(installation_12m) as installation, max(pm_12m) as pm,
         bool_and(calls_12m = field_12m + installation_12m + pm_12m
                  and calls_total = field_total + installation_total + pm_total
                  and calls_open = field_open + installation_open + pm_open) as adds_up,
         max(per_100_machines) as per_100
    from public.failure_rate_by_product where product = 'KRPROD';
rollback;

\echo '--- 2. failure modes: a row per register; the Field call typed BREAKDOWN counts as Field ---'
\echo 'expect: Field NO DISPLAY 2 | Installation INSTALLATION 1 | PM PM 1'
begin; set local role authenticated;
  select register, complaint, calls from public.failure_modes_by_product where product = 'KRPROD' order by register;
rollback;

\echo '--- 3. spare use: the register on each consumption ---'
\echo 'expect: Field 3 parts on 2 calls | PM 3 parts on 1 call'
begin; set local role authenticated;
  select register, sum(qty) as parts, sum(calls) as calls from public.spare_usage_rollup where product = 'KRPROD' group by register order by register;
rollback;

\echo '--- 4. as the engineer: only their own Field call ---'
\echo 'expect: rate field 1, installation 0, pm 0 | modes Field 1 | spares Field 2'
call public.be('kr_eng@x.com');
begin; set local role authenticated;
  select max(field_12m) as field, max(installation_12m) as installation, max(pm_12m) as pm
    from public.failure_rate_by_product where product = 'KRPROD';
  select register, calls from public.failure_modes_by_product where product = 'KRPROD';
  select register, sum(qty) as parts from public.spare_usage_rollup where product = 'KRPROD' group by register;
rollback;

\echo '--- 5. every view still applies the reader''s row-level security ---'
\echo 'expect: 4 views, all security_invoker'
select count(*) filter (where 'security_invoker=on' = any (reloptions)) as invoker
  from pg_class where relname in ('spare_usage', 'spare_usage_rollup', 'failure_rate_by_product', 'failure_modes_by_product')
   and relnamespace = 'public'::regnamespace;
