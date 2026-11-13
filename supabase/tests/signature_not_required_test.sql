-- ===========================================================================
-- NO SIGNATURE IS ASKED OF A TEST ACCOUNT OR AN INACTIVE USER (0477).
--   A login needs no signature when its User Master row is tagged "Test
--   Account" (any case, any spacing; matched on the Air Liquide ID or the
--   Gmail), when that row is inactive, or when the login itself is inactive.
--   The tracker says so per login; my_signature_required() answers the
--   signed-in login only; the public key may ask neither.
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e477000-0000-0000-0000-000000000001', 'snr_admin@x.com'),
  ('0e477000-0000-0000-0000-000000000002', 'snr_normal@x.com'),
  ('0e477000-0000-0000-0000-000000000003', 'snr_test@x.com'),
  ('0e477000-0000-0000-0000-000000000004', 'snr_gmailtest@gmail.com'),
  ('0e477000-0000-0000-0000-000000000005', 'snr_leaver@x.com'),
  ('0e477000-0000-0000-0000-000000000006', 'snr_offlogin@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, active) values
  ('0e477000-0000-0000-0000-000000000001', 'snr_admin@x.com',         'SNR Admin',      'admin',    true),
  ('0e477000-0000-0000-0000-000000000002', 'snr_normal@x.com',        'SNR Normal',     'engineer', true),
  ('0e477000-0000-0000-0000-000000000003', 'snr_test@x.com',          'SNR Test',       'engineer', true),
  ('0e477000-0000-0000-0000-000000000004', 'snr_gmailtest@gmail.com', 'SNR Gmail Test', 'engineer', true),
  ('0e477000-0000-0000-0000-000000000005', 'snr_leaver@x.com',        'SNR Leaver',     'engineer', true),
  ('0e477000-0000-0000-0000-000000000006', 'snr_offlogin@x.com',      'SNR Off Login',  'engineer', false)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = excluded.active;
insert into public.user_directory (name, email, gmail, validity, tags) values
  ('SNR Normal',     'snr_normal@x.com',  '',                        true,  '{}'),
  ('SNR Test',       'snr_test@x.com',    '',                        true,  '{"  test   ACCOUNT "}'),
  ('SNR Gmail Test', 'snr_gt@x.com',      'snr_gmailtest@gmail.com', true,  '{"Test Account"}'),
  ('SNR Leaver',     'snr_leaver@x.com',  '',                        false, '{}'),
  ('SNR Off Login',  'snr_offlogin@x.com','',                        true,  '{}');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. the tracker says who must sign ---'
\echo 'expect: Normal t | Test f | Gmail Test f | Leaver f | Off Login f'
call public.be('snr_admin@x.com');
begin; set local role authenticated;
  select full_name, required from public.signature_tracker() where email like 'snr_%' and full_name <> 'SNR Admin' order by full_name;
rollback;

\echo '--- 2. each login asks only about itself ---'
\echo 'expect: normal t | test f'
call public.be('snr_normal@x.com');
begin; set local role authenticated; select public.my_signature_required() as normal_required; rollback;
call public.be('snr_test@x.com');
begin; set local role authenticated; select public.my_signature_required() as test_required; rollback;

\echo '--- 3. the rule itself is not callable from outside; the public key asks nothing ---'
\echo 'expect ERROR: permission denied for function signature_not_required'
call public.be('snr_normal@x.com');
begin; set local role authenticated;
  select public.signature_not_required('0e477000-0000-0000-0000-000000000003');
rollback;
\echo 'expect ERROR: permission denied for function my_signature_required'
begin; set local role anon; select public.my_signature_required(); rollback;
\echo 'expect ERROR: needs "Edit User Master details"'
begin; set local role authenticated; select count(*) from public.signature_tracker(); rollback;
