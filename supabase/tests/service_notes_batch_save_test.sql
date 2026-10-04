-- ===========================================================================
-- TECHNICAL / SERVICE NOTES BETA EDIT: MANY EDITS, ONE SAVE (0355).
--
-- WHAT THIS PROVES:
--   1. a docs.manage holder saves several notes in one call, every field the
--      grid offers written, a blanked date cleared, untouched fields kept, and
--      the Latest marks (0354) follow a changed Dated;
--   2. ALL OR NOTHING: a batch with one bad element (a blank title; an id that
--      is not a note) saves none of its notes;
--   3. the caller's own rights decide (SECURITY INVOKER): an engineer without
--      docs.manage saves nothing -- the policy matches no row and the function
--      raises rather than reporting it saved; the public key cannot call it.
--
-- Run ONCE after _stub.sql + every migration, as `authenticated` -- a superuser
-- ignores RLS and would pass part 3 with the policy removed.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('03550000-0000-0000-0000-000000000001', 'bs-admin@x.com'),
  ('03550000-0000-0000-0000-000000000002', 'bs-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('03550000-0000-0000-0000-000000000001', 'bs-admin@x.com', 'BS ADMIN', 'admin'),
  ('03550000-0000-0000-0000-000000000002', 'bs-eng@x.com',   'BS ENG',   'engineer')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

insert into public.documents (kind, title, product, url, dated, effective_date, doc_no, extra) values
  ('service_note',   'BS-1', 'VEGA', 'https://x/bs1', '2024-01-01', '2024-01-01', 'TN-1', '{"Folder Path": "/a"}'),
  ('service_note',   'BS-2', 'VEGA', 'https://x/bs2', '2025-01-01', null,         'TN-2', '{}'),
  ('service_manual', 'BS-M', 'VEGA', 'https://x/bsm', null,         null,         '',     '{}');

\echo ''
\echo '--- 1. one save, several notes ---'
call public.be('bs-admin@x.com');
set role authenticated;
select public.save_service_notes(jsonb_build_array(
  jsonb_build_object('id', (select id from public.documents where title = 'BS-1'),
                     'title', 'BS-1 renamed', 'dated', '2026-05-05', 'effective_date', '',
                     'revision', '03', 'product', 'VEGA, ORION', 'extra', '{"Folder Path": "/b"}'::jsonb),
  jsonb_build_object('id', (select id from public.documents where title = 'BS-2'),
                     'tags', 'battery, alarm', 'doc_no', 'TN-2A')
)) as saved_should_be_2;
reset role;
select 'after the save' as check,
  (select title || ' | ' || dated::text || ' | ' || coalesce(effective_date::text, 'cleared') || ' | ' || revision || ' | ' || product || ' | ' || doc_no || ' | ' || (extra->>'Folder Path')
     from public.documents where doc_no = 'TN-1') as bs1_should_be_renamed_20260505_cleared_03_vega_orion_tn1_b,
  (select tags || ' | ' || doc_no || ' | ' || title from public.documents where doc_no = 'TN-2A') as bs2_should_be_tags_tn2a_title_kept,
  (select latest_for = '{ORION,VEGA}' from public.documents where doc_no = 'TN-1')::text as bs1_latest_for_vega_and_orion_should_be_true,
  (select latest_for = '{}' from public.documents where doc_no = 'TN-2A')::text as bs2_no_longer_latest_should_be_true;

\echo ''
\echo '--- 2. all or nothing ---'
set role authenticated;
\echo 'expect ERROR: Note needs a title and a link -- nothing was saved'
select public.save_service_notes(jsonb_build_array(
  jsonb_build_object('id', (select id from public.documents where doc_no = 'TN-2A'), 'tags', 'SHOULD NOT SAVE'),
  jsonb_build_object('id', (select id from public.documents where doc_no = 'TN-1'), 'title', '  ')
));
\echo 'expect ERROR: not saved -- a service manual is not a note'
select public.save_service_notes(jsonb_build_array(
  jsonb_build_object('id', (select id from public.documents where doc_no = 'TN-2A'), 'tags', 'SHOULD NOT SAVE'),
  jsonb_build_object('id', (select id from public.documents where title = 'BS-M'), 'tags', 'x')
));
reset role;
select 'nothing from the failed batches' as check,
  (select tags from public.documents where doc_no = 'TN-2A') as should_be_battery_alarm,
  (select title from public.documents where doc_no = 'TN-1') as should_be_bs1_renamed;

\echo ''
\echo '--- 3. the caller''s own rights decide ---'
call public.be('bs-eng@x.com');
set role authenticated;
\echo 'expect ERROR: was not saved -- your role may not edit it'
select public.save_service_notes(jsonb_build_array(
  jsonb_build_object('id', (select id from public.documents where doc_no = 'TN-2A'), 'tags', 'ENGINEER EDIT')));
reset role;
select 'the engineer changed nothing' as check,
  (select tags from public.documents where doc_no = 'TN-2A') as should_be_battery_alarm;
set role anon;
\echo 'expect ERROR: permission denied for function (anon)'
select public.save_service_notes('[]'::jsonb);
reset role;
