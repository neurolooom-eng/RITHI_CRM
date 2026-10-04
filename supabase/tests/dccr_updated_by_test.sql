-- ===========================================================================
-- THE DCCR'S UPDATED BY / UPDATED DATE (0344).
--
--   The user, 2026-10-04: they come from the import; for a call made in RITHI,
--   Updated By is the email of the person who registered the call and Updated
--   Date is the call's registration date.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e344000-0000-0000-0000-000000000001', 'reg.person@example.com'),
  ('0e344000-0000-0000-0000-000000000002', 'never.registered@example.com');
insert into public.profiles (id, email, full_name, role) values
  ('0e344000-0000-0000-0000-000000000001', 'reg.person@example.com', 'Reg Person', 'hotline'),
  ('0e344000-0000-0000-0000-000000000002', 'never.registered@example.com', 'Never Registered', 'engineer')
on conflict (id) do nothing;

insert into public.field_calls (ucn, call_number, reg_date, party_name, product_name, serial, actual_created_by)
values ('26X01F9001', 'UB-1', '2026-03-05', 'UB PARTY', 'UB VENT', 'UB-1', '0e344000-0000-0000-0000-000000000001'),
       ('26X01F9002', 'UB-2', '2026-03-06', 'UB PARTY', 'UB VENT', 'UB-2', '0e344000-0000-0000-0000-000000000001');

\echo '--- 1. A CALL MADE IN RITHI: THE REGISTRANT''S EMAIL AND THE REGISTRATION DATE ---'
select 'registrant email and reg date',
       (dccr_updated_by, dccr_updated_date) = ('reg.person@example.com', date '2026-03-05') as ok
  from public.field_call_review where ucn = '26X01F9001';

\echo '--- 2. AN IMPORTED ROW KEEPS THE FILE''S VALUES ---'
insert into public.call_reviews (ucn, imported, imported_updated_by, imported_updated_date)
values ('26X01F9002', true, 'service.almsind@gmail.com', '2026-01-08');
select 'imported values win',
       (dccr_updated_by, dccr_updated_date) = ('service.almsind@gmail.com', date '2026-01-08') as ok
  from public.field_call_review where ucn = '26X01F9002';

\echo '--- 3. THE EMAIL DOOR OPENS ONLY FOR SOMEBODY WHO REGISTERED A CALL ---'
select 'a registrant answers; anybody else does not',
       public.call_registrant_email('0e344000-0000-0000-0000-000000000001') = 'reg.person@example.com'
   and public.call_registrant_email('0e344000-0000-0000-0000-000000000002') is null as ok;
select 'the public key cannot run it',
       not has_function_privilege('anon', 'public.call_registrant_email(uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.call_registrant_email(uuid)', 'EXECUTE') as ok;
