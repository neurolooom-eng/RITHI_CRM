-- ===========================================================================
-- TECHNICAL / SERVICE NOTES: THE LATEST NOTE PER PRODUCT (0350).
--
-- WHAT THIS PROVES:
--   1. the newest DATED live note of each product is marked, PER PRODUCT: a
--      note for two products can be the latest for one and not the other;
--      products compare case-insensitively; a note with no product is the
--      "Every product" group ('');
--   2. an undated note and a retired note are never marked; two notes on the
--      same newest date are both marked;
--   3. adding a newer note moves the mark by itself (the trigger), and so do
--      a changed Dated and retiring the latest note;
--   4. a service manual is never touched;
--   5. the button: refresh_service_note_latest() puts a hand-damaged mark
--      right for a docs.manage holder, is refused without it, and the public
--      key cannot call it.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('03500000-0000-0000-0000-000000000001', 'sn-admin@x.com'),
  ('03500000-0000-0000-0000-000000000002', 'sn-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('03500000-0000-0000-0000-000000000001', 'sn-admin@x.com', 'SN ADMIN', 'admin'),
  ('03500000-0000-0000-0000-000000000002', 'sn-eng@x.com',   'SN ENG',   'engineer')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

insert into public.documents (kind, title, product, url, dated) values
  ('service_note', 'SN-A old VEGA',        'VEGA',               'https://x/a', '2024-01-10'),
  ('service_note', 'SN-B VEGA + ORION',    'VEGA, ORION',        'https://x/b', '2025-03-01'),
  ('service_note', 'SN-C newer ORION',     'orion',              'https://x/c', '2025-06-01'),
  ('service_note', 'SN-D undated VEGA',    'VEGA',               'https://x/d', null),
  ('service_note', 'SN-E general',         '',                   'https://x/e', '2023-05-05'),
  ('service_note', 'SN-F retired MONNAL',  'MONNAL T60',         'https://x/f', '2026-01-01'),
  ('service_note', 'SN-G MONNAL',          'MONNAL T60',         'https://x/g', '2025-01-01'),
  ('service_note', 'SN-H MONNAL same day', 'MONNAL T60',         'https://x/h', '2025-01-01'),
  ('service_manual', 'SM VEGA manual',     'VEGA',               'https://x/m', '2026-01-01');
update public.documents set active = false where title = 'SN-F retired MONNAL';

\echo ''
\echo '--- 1 and 2. the marks after loading ---'
select title, array_to_string(latest_for, ' | ') as latest_for
  from public.documents where title like 'S%' order by title;
select 'the marks' as check,
  (select latest_for = '{VEGA}'       from public.documents where title = 'SN-B VEGA + ORION')::text as b_latest_for_vega_only_should_be_true,
  (select latest_for = '{orion}'      from public.documents where title = 'SN-C newer ORION')::text  as c_latest_for_orion_should_be_true,
  (select latest_for = '{}'           from public.documents where title = 'SN-A old VEGA')::text     as a_not_latest_should_be_true,
  (select latest_for = '{}'           from public.documents where title = 'SN-D undated VEGA')::text as undated_never_should_be_true,
  (select latest_for = '{""}'         from public.documents where title = 'SN-E general')::text      as general_every_product_should_be_true,
  (select latest_for = '{}'           from public.documents where title = 'SN-F retired MONNAL')::text as retired_never_should_be_true,
  (select count(*) from public.documents where title in ('SN-G MONNAL', 'SN-H MONNAL same day')
      and latest_for = '{"MONNAL T60"}')::text as same_day_both_should_be_2,
  (select latest_for = '{}'           from public.documents where title = 'SM VEGA manual')::text    as manual_untouched_should_be_true;

\echo ''
\echo '--- 3. a newer note moves the mark by itself ---'
insert into public.documents (kind, title, product, url, dated)
values ('service_note', 'SN-I newest VEGA', 'VEGA', 'https://x/i', '2026-02-02');
select 'after adding a newer VEGA note' as check,
  (select latest_for = '{VEGA}' from public.documents where title = 'SN-I newest VEGA')::text as i_latest_should_be_true,
  (select latest_for = '{}'     from public.documents where title = 'SN-B VEGA + ORION')::text as b_cleared_should_be_true;

update public.documents set dated = '2026-03-03' where title = 'SN-D undated VEGA';
select 'after dating the undated note newest' as check,
  (select latest_for = '{VEGA}' from public.documents where title = 'SN-D undated VEGA')::text as d_latest_should_be_true,
  (select latest_for = '{}'     from public.documents where title = 'SN-I newest VEGA')::text  as i_cleared_should_be_true;

update public.documents set active = false where title = 'SN-D undated VEGA';
select 'after retiring the latest' as check,
  (select latest_for = '{VEGA}' from public.documents where title = 'SN-I newest VEGA')::text as i_back_should_be_true;

\echo ''
\echo '--- 5. the button ---'
-- Damage a mark by hand, as the owner (the column is the database''s to write).
update public.documents set latest_for = '{}' where title = 'SN-I newest VEGA';
call public.be('sn-admin@x.com');
set role authenticated;
select public.refresh_service_note_latest() as changed_should_be_1;
reset role;
select 'after the button' as check,
  (select latest_for = '{VEGA}' from public.documents where title = 'SN-I newest VEGA')::text as i_restored_should_be_true;

call public.be('sn-eng@x.com');
set role authenticated;
\echo 'expect ERROR: permission (engineer has no docs.manage)'
select public.refresh_service_note_latest();
\echo 'expect ERROR: permission denied for function refresh_service_note_latest_all'
select public.refresh_service_note_latest_all();
reset role;
set role anon;
\echo 'expect ERROR: permission denied for function (anon)'
select public.refresh_service_note_latest();
reset role;
