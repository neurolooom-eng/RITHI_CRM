-- ===========================================================================
-- A Technical / Service Note keeps its Drive details (0299).
--   The Drive listing's Created / Last Modified / Last Modified By go into
--   their own columns and are NOT overwritten by an edit here; RITHI's own
--   created_at and author stay as the audit trail beside them.
--   The public key still cannot write a document.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('d9000000-0000-0000-0000-000000000001','dd_admin@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('d9000000-0000-0000-0000-000000000001','dd_admin@x.com','DD Admin','admin')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. a note loaded with its Drive details, as the upload writes it ---'
\echo 'expect: 1 row, 2022-11-19 06:38:00+00 / 2022-11-19 06:35:00+00 / A Person, two products'
call public.be('dd_admin@x.com');
begin; set local role authenticated;
  insert into public.documents (kind, title, product, url, source_created_at, source_modified_at, source_modified_by)
  values ('service_note', 'TN-DD-1', 'MONNAL T60, MONNAL T75', 'https://drive.google.com/file/d/dd1/view',
          '2022-11-19T12:08:00+05:30', '2022-11-19T12:05:00+05:30', 'A Person');
commit;
select title, product, source_created_at at time zone 'UTC' as drive_created,
       source_modified_at at time zone 'UTC' as drive_modified, source_modified_by,
       uploaded_by is not null as rithi_author_kept
  from public.documents where title = 'TN-DD-1';

\echo '--- 2. editing it here leaves the Drive details alone ---'
\echo 'expect: t | t | t  (Drive dates unchanged, Drive name unchanged, created_at unchanged)'
create temp table dd_before as select id, created_at, source_created_at, source_modified_at from public.documents where title = 'TN-DD-1';
grant select on dd_before to authenticated;
call public.be('dd_admin@x.com');
begin; set local role authenticated;
  update public.documents set tags = 'edited' where title = 'TN-DD-1';
commit;
select d.source_created_at = b.source_created_at and d.source_modified_at = b.source_modified_at as drive_dates_kept,
       d.source_modified_by = 'A Person' as drive_name_kept,
       d.created_at = b.created_at as rithi_created_kept
  from public.documents d join dd_before b using (id);

\echo '--- 3. the upload key still matches it: a re-load corrects instead of duplicating ---'
\echo 'expect: 1 row, Drive modified now 2023-01-01 04:30:00'
call public.be('dd_admin@x.com');
begin; set local role authenticated;
  insert into public.documents (kind, title, url, source_modified_at)
  values ('service_note', 'TN-DD-1', 'https://drive.google.com/file/d/dd1/view', '2023-01-01T10:00:00+05:30')
  on conflict (url_key) do update set source_modified_at = excluded.source_modified_at;
commit;
select count(*) as rows, max(source_modified_at at time zone 'UTC') as drive_modified
  from public.documents where url_key = lower('https://drive.google.com/file/d/dd1/view');

\echo '--- 4. the public key cannot write a document ---'
\echo 'expect ERROR: row-level security (anon insert)'
-- The harness's auth.uid() reads the harness table, not the role: clear it, or
-- anon would still be the administrator from step 3.
update public.harness set uid = null, email = null;
begin; set local role anon;
  insert into public.documents (kind, title, url, source_modified_by) values ('service_note', 'X', 'https://x/anon', 'anon');
rollback;
