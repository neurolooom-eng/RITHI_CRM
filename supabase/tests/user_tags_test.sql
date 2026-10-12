-- ===========================================================================
-- TAGS ON THE USER MASTER (0408).
--
--   A person carries several free-text tags, stored trimmed, with blanks
--   dropped and one per spelling case-blind (the first spelling kept), however
--   they are written; an empty list is allowed; a signed-in user may read them
--   and one without the directory's edit right may not change them.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values ('e1e1e408-0000-0000-0000-000000000001', 'tags_plain@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('e1e1e408-0000-0000-0000-000000000001', 'tags_plain@x.com', 'TAGS PLAIN', 'engineer')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.user_directory (name, email, tags) values
 ('TAG ONE', 'tag1@x.com', array[' CAPA Responsibility ', 'capa responsibility', '', 'Ventilator']),
 ('TAG TWO', 'tag2@x.com', default);

select 'tags are trimmed, blanks dropped, one per spelling case-blind, first spelling kept' as t,
       (select tags = array['CAPA Responsibility', 'Ventilator'] from public.user_directory where name = 'TAG ONE') as ok;
select 'a person may have no tags' as t,
       (select tags = '{}'::text[] from public.user_directory where name = 'TAG TWO') as ok;
update public.user_directory set tags = array['QA', 'qa ', 'CAPA Responsibility'] where name = 'TAG TWO';
select 'the same tidying on an edit' as t,
       (select tags = array['QA', 'CAPA Responsibility'] from public.user_directory where name = 'TAG TWO') as ok;

call public.be('tags_plain@x.com');
set role authenticated;
select 'a signed-in user reads the tags' as t,
       (select count(*) = 2 from public.user_directory where 'CAPA Responsibility' = any (tags) and name like 'TAG %') as ok;
update public.user_directory set tags = '{}' where name = 'TAG ONE';
reset role;
select 'one without the directory''s edit right cannot change them' as t,
       (select tags = array['CAPA Responsibility', 'Ventilator'] from public.user_directory where name = 'TAG ONE') as ok;
