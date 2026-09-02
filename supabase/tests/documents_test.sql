-- ===========================================================================
-- Document library (0070) — the service-manual shelf and the QMS shelf.
--
-- What has to hold: everyone signed in can READ both shelves (a manual nobody
-- can open is no use in the field), the two shelves are maintained by two
-- SEPARATE rights, and neither right lets a document be moved onto the other
-- shelf.
--
-- Run after _stub.sql + every migration:
--   psql ... -f supabase/tests/documents_test.sql
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- ---- personas -------------------------------------------------------------
--   dl_docs — may maintain service manuals only
--   dl_qms  — may maintain QMS documents only
--   dl_eng  — a plain engineer: reads both, writes neither
insert into auth.users (id, email) values
  ('c1c1c1c1-0000-0000-0000-000000000001','dl_docs@x.com'),
  ('c1c1c1c1-0000-0000-0000-000000000002','dl_qms@x.com'),
  ('c1c1c1c1-0000-0000-0000-000000000003','dl_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('c1c1c1c1-0000-0000-0000-000000000001','dl_docs@x.com','DL Docs','dl_docs'),
  ('c1c1c1c1-0000-0000-0000-000000000002','dl_qms@x.com','DL Qms','dl_qms'),
  ('c1c1c1c1-0000-0000-0000-000000000003','dl_eng@x.com','DL Eng','dl_eng')
on conflict (id) do update set role = excluded.role;

-- MERGE, never overwrite: an admin may have tuned an existing role.
insert into public.app_roles (role, label, permissions) values
  ('dl_docs','DL Docs','["docs.manage"]'::jsonb),
  ('dl_qms', 'DL Qms', '["qms.manage"]'::jsonb),
  ('dl_eng', 'DL Eng', '["calls.view"]'::jsonb)
on conflict (role) do update
  set permissions = (select jsonb_agg(distinct v)
                       from jsonb_array_elements(public.app_roles.permissions || excluded.permissions) v);

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

\echo '--- 1. docs.manage puts a manual on the shelf ---'
call public.be('dl_docs@x.com');
begin;
  set local role authenticated;
  insert into public.documents (kind, title, product, url, tags)
    values ('service_manual','DL VEGA manual','VEGA','https://drive/x1','ventilator, calibration');
  insert into public.documents (kind, title, product, url)
    values ('service_manual','DL General safety','','https://drive/x2');
  select title, product, active from public.documents where title like 'DL %' order by title;
commit;

\echo '--- 2. ...but NOT onto the QMS shelf (expect ERROR: row-level security) ---'
begin;
  set local role authenticated;
  insert into public.documents (kind, title, doc_no, url)
    values ('qms','DL Sneaked SOP','QMS-999','https://drive/x3');
commit;

\echo '--- 3. qms.manage is the other way round: QMS yes, manual no (expect ERROR) ---'
call public.be('dl_qms@x.com');
begin;
  set local role authenticated;
  insert into public.documents (kind, title, doc_no, revision, effective_date, url)
    values ('qms','DL Calibration SOP','QMS-014','03','2026-01-01','https://drive/x4');
  select title, doc_no, revision from public.documents where title = 'DL Calibration SOP';
commit;
begin;
  set local role authenticated;
  insert into public.documents (kind, title, url) values ('service_manual','DL Sneaked manual','https://drive/x5');
commit;

\echo '--- 4. a manual cannot be MOVED onto the QMS shelf by the manual keeper (expect ERROR) ---'
call public.be('dl_docs@x.com');
begin;
  set local role authenticated;
  update public.documents set kind = 'qms' where title = 'DL VEGA manual';
commit;
select title, kind from public.documents where title = 'DL VEGA manual';

\echo '--- 5. an engineer READS both shelves and writes neither (expect ERROR on the write) ---'
call public.be('dl_eng@x.com');
begin;
  set local role authenticated;
  select count(*) as readable from public.documents where title like 'DL %';
commit;
begin;
  set local role authenticated;
  insert into public.documents (kind, title, url) values ('service_manual','DL Engineer manual','https://drive/x6');
commit;

\echo '--- 6. authorship is stamped and not editable ---'
call public.be('dl_docs@x.com');
begin;
  set local role authenticated;
  update public.documents set uploaded_by = 'c1c1c1c1-0000-0000-0000-000000000003'
   where title = 'DL VEGA manual';
commit;
\echo 'expect: still DL Docs'''' own id, ...0001'
select uploaded_by from public.documents where title = 'DL VEGA manual';

\echo '--- 7. retiring is an update, so the keeper may do it; the row stays ---'
begin;
  set local role authenticated;
  update public.documents set active = false where title = 'DL General safety';
commit;
select title, active from public.documents where title = 'DL General safety';

\echo '--- 8. cleanup ---'
delete from public.documents where title like 'DL %';
delete from public.app_roles where role in ('dl_docs','dl_qms','dl_eng');
delete from public.profiles where email like 'dl_%';
