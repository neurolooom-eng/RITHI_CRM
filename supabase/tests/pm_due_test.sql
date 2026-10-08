-- ===========================================================================
-- PM DUE (0401, 0402).
--
--   Visit k of a cover falls on start + k x months x 30 / visits days; each
--   machine with a visit due in the month is listed once, warranty first; it
--   is GENERATED when a PM call reading "k / N" for that machine exists in the
--   cover period and is not cancelled -- in whatever month it was raised --
--   and MISSED PM otherwise; an accessory is marked by the Product Master's
--   category; the engineer is the Product Database's; the answer is the same
--   whoever reads it; nobody without pm.generate may ask, and the public key
--   cannot call it at all.
--
-- Superuser bypasses RLS, so the reads that matter run as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('e1e1e401-0000-0000-0000-000000000001', 'pmdue_gen@x.com'),
 ('e1e1e401-0000-0000-0000-000000000002', 'pmdue_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, designation, extra_permissions) values
 ('e1e1e401-0000-0000-0000-000000000001', 'pmdue_gen@x.com', 'PM GEN', 'engineer', '', '["pm.generate"]'),
 ('e1e1e401-0000-0000-0000-000000000002', 'pmdue_eng@x.com', 'PM ENG', 'engineer', '', '["mod:/pm-due"]')
on conflict (id) do update set role = excluded.role, extra_permissions = excluded.extra_permissions;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.product_master (product_code, product_name, item_category)
values ('PD-ACC', 'PD CARE', 'ACCESSORY'), ('PD-ORI', 'ORION-G', 'VENTILATOR-ICU')
on conflict do nothing;

-- Warranties from 10 Jan, 12 months, 3 visits -> 120 days: 10 May, 7 Sep, 5 Jan.
--   PD-1  ORION-G   the visit-1 call raised in May, the visit-2 call CANCELLED
--   PD-4  PD CARE   an accessory
--   PD-5  ORION-G   its visit-1 call raised in JUNE -- a month late
--   PD-6  ORION-G   a May call reading 2 / 3 -- the wrong visit
--   PD-7  ORION-G   a "1 / 3" call from BEFORE this cover started
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end, warranty_months, pm_visits)
values ('SA-PD-1', 'PD HOSPITAL', '2026-01-10', '2027-01-09', 12, 3);
insert into public.sale_items (uid, sa_number, product_name, serial_number) values
 ('PD-U1', 'SA-PD-1', 'ORION-G', 'PD-1'),
 ('PD-U4', 'SA-PD-1', 'PD CARE', 'PD-4'),
 ('PD-U5', 'SA-PD-1', 'ORION-G', 'PD-5'),
 ('PD-U6', 'SA-PD-1', 'ORION-G', 'PD-6'),
 ('PD-U7', 'SA-PD-1', 'ORION-G', 'PD-7');
-- PD-2: contract from 1 Jan, 12 months, 2 visits -> 180 days: 30 Jun.
insert into public.contract_entries (mc_number, party_name, contract_start, contract_end, contract_months, pm_visits_total, contract_type)
values ('MC-PD-2', 'PD CLINIC', '2026-01-01', '2026-12-31', 12, 2, 'CMC');
insert into public.contract_items (uid, mc_number, product_name, serial_number)
values ('PD-U2', 'MC-PD-2', 'VEGA', 'PD-2');
-- PD-3: a warranty AND a contract, both with a visit in May.
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end, warranty_months, pm_visits)
values ('SA-PD-3', 'PD THREE', '2026-01-10', '2027-01-09', 12, 3);
insert into public.sale_items (uid, sa_number, product_name, serial_number)
values ('PD-U3', 'SA-PD-3', 'VEGA', 'PD-3');
insert into public.contract_entries (mc_number, party_name, contract_start, contract_end, contract_months, pm_visits_total, contract_type)
values ('MC-PD-3', 'PD THREE', '2026-01-10', '2027-01-09', 12, 3, 'AMC');
insert into public.contract_items (uid, mc_number, product_name, serial_number)
values ('PD-U3C', 'MC-PD-3', 'VEGA', 'PD-3');

update public.products set service_engineer = 'ENG ALPHA'
 where machine_key = 'orion-g|pd-1';
select 'PD-1 is on the Product Database (the sale filled it)' as t,
       exists (select 1 from public.products where machine_key = 'orion-g|pd-1') as ok;

-- The PM calls: allotted to somebody the caller does not manage and filed by
-- nobody, so row-level security HIDES them from the caller -- which is what
-- makes "generated" below prove anything.
call public.be('pmdue_eng@x.com');
insert into public.pm_calls (ucn, call_number, call_type, reg_date, reg_at, product_name, serial, party_name, complaint_reported, allocated_to, created_by) values
 ('PD-PM-1', 'PDPM1', 'P M VISIT', '2026-05-01', '2026-05-01 00:30:00+05:30', 'ORION-G', 'PD-1', 'PD HOSPITAL', 'SCHEDULED PM VISIT 1 / 3', 'SOMEBODY ELSE', null),
 ('PD-PM-2', 'PDPM2', 'P M VISIT', '2026-05-01', '2026-05-01 00:31:15+05:30', 'OTHER', 'ZZ-1', 'ELSEWHERE', 'SCHEDULED PM VISIT 1 / 2', 'SOMEBODY ELSE', null),
 ('PD-PM-5', 'PDPM5', 'P M VISIT', '2026-06-01', '2026-06-01 00:30:00+05:30', 'ORION-G', 'PD-5', 'PD HOSPITAL', 'SCHEDULED PM VISIT 1 / 3', 'SOMEBODY ELSE', null),
 ('PD-PM-6', 'PDPM6', 'P M VISIT', '2026-05-01', '2026-05-01 00:32:00+05:30', 'ORION-G', 'PD-6', 'PD HOSPITAL', 'SCHEDULED PM VISIT 2 / 3', 'SOMEBODY ELSE', null),
 ('PD-PM-7', 'PDPM7', 'P M VISIT', '2025-05-01', '2025-05-01 00:30:00+05:30', 'ORION-G', 'PD-7', 'PD HOSPITAL', 'SCHEDULED PM VISIT 1 / 3', 'SOMEBODY ELSE', null);
insert into public.pm_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, complaint_reported, allocated_to, created_by, cancelled_at, cancel_reason)
values ('PD-PM-3', 'PDPM3', 'P M VISIT', '2026-09-01', 'ORION-G', 'PD-1', 'PD HOSPITAL', 'SCHEDULED PM VISIT 2 / 3', 'SOMEBODY ELSE', null, now(), 'test');

call public.be('pmdue_gen@x.com');
set role authenticated;

select 'the caller cannot read those PM calls' as t,
       not exists (select 1 from public.pm_calls where ucn like 'PD-PM-%') as ok;
select 'April: nothing of PD-1 is due' as t,
       not exists (select 1 from public.pm_visits_due('2026-04-01') where serial = 'PD-1') as ok;
select 'May: PD-1 visit 1 of 3, due 10 May, from the warranty, engineer from the Product Database, a product' as t,
       (select visit_no = 1 and pm_visits = 3 and due_date = '2026-05-10' and source = 'Warranty'
               and engineer = 'ENG ALPHA' and cover_type = 'WGP' and not is_accessory
          from public.pm_visits_due('2026-05-01') where serial = 'PD-1') as ok;
select 'May: PD-1 is GENERATED by the 1 / 3 call it cannot see' as t,
       (select generated and generated_ucn = 'PD-PM-1' and generated_on = '2026-05-01'
          from public.pm_visits_due('2026-05-01') where serial = 'PD-1') as ok;
select 'May: PD-4 is listed and marked an accessory' as t,
       (select is_accessory and not generated from public.pm_visits_due('2026-05-01') where serial = 'PD-4') as ok;
select 'May: PD-5 is GENERATED by its 1 / 3 call raised in June' as t,
       (select generated and generated_ucn = 'PD-PM-5' from public.pm_visits_due('2026-05-01') where serial = 'PD-5') as ok;
select 'May: PD-6 is MISSED -- its call reads 2 / 3 -- and shows that call as its last PM' as t,
       (select not generated and last_pm_on = '2026-05-01' from public.pm_visits_due('2026-05-01') where serial = 'PD-6') as ok;
select 'May: PD-7 is MISSED -- its 1 / 3 call is from before this cover started' as t,
       (select not generated from public.pm_visits_due('2026-05-01') where serial = 'PD-7') as ok;
select 'September: PD-1 visit 2 is MISSED -- the 2 / 3 call is cancelled; last PM is May' as t,
       (select visit_no = 2 and due_date = '2026-09-07' and not generated and last_pm_on = '2026-05-01'
          from public.pm_visits_due('2026-09-01') where serial = 'PD-1') as ok;
select 'January next year: PD-1 visit 3, due 5 Jan' as t,
       (select visit_no = 3 and due_date = '2027-01-05' from public.pm_visits_due('2027-01-01') where serial = 'PD-1') as ok;
select 'June: PD-2 visit 1 of 2 from the contract, due 30 Jun, CMC' as t,
       (select visit_no = 1 and due_date = '2026-06-30' and source = 'Contract' and cover_type = 'CMC' and ref_no = 'MC-PD-2'
          from public.pm_visits_due('2026-06-01') where serial = 'PD-2') as ok;
select 'May: PD-3 listed ONCE, from the warranty' as t,
       (select count(*) = 1 and min(source) = 'Warranty' from public.pm_visits_due('2026-05-01') where serial = 'PD-3') as ok;
select 'the batch starts after the LARGEST registration time in the month, whoever''s call' as t,
       public.pm_due_latest_reg_at('2026-05-01') = '2026-05-01 00:32:00+05:30'::timestamptz as ok;
reset role;

call public.be('pmdue_eng@x.com');
set role authenticated;
\echo '-- expect ERROR: the PM visits due need pm.generate'
select count(*) from public.pm_visits_due('2026-05-01');
\echo '-- expect ERROR: so does the latest registration time'
select public.pm_due_latest_reg_at('2026-05-01');
reset role;

select '0401''s count-based pm_due is gone' as t,
       to_regprocedure('public.pm_due(date)') is null as ok;
select 'the public key cannot run either function' as t,
       not has_function_privilege('anon', 'public.pm_visits_due(date)', 'execute')
   and not has_function_privilege('anon', 'public.pm_due_latest_reg_at(date)', 'execute') as ok;
select 'the screen key reached admin and technical_support and nobody else' as t,
       not exists (select 1 from public.app_roles where permissions ? 'mod:/pm-due'
                    and role not in ('admin', 'technical_support')) as ok;
select 'pm.generate is in no role' as t,
       not exists (select 1 from public.app_roles where permissions ? 'pm.generate') as ok;
