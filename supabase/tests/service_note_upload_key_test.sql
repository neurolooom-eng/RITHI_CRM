-- ===========================================================================
-- Technical / Service Notes upload key (0272): a re-load CORRECTS a note found
-- by its Drive link instead of adding a second copy; two notes cannot share a
-- link; other kinds of document are not constrained by it.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.documents (kind, title, product, url)
values ('service_note', 'NT606', 'EXTEND-XT', 'https://drive.google.com/file/d/AAA/view');

\echo '--- 1. the same link loaded again corrects the note ---'
\echo 'expect: 1 row, product MONNAL T75, title NT606 (T75)'
insert into public.documents (kind, title, product, url)
values ('service_note', 'NT606 (T75)', 'MONNAL T75', ' https://drive.google.com/file/d/AAA/view ')
on conflict (url_key) do update set title = excluded.title, product = excluded.product;
select count(*) as rows, max(product) as product, max(title) as title from public.documents where url_key = 'https://drive.google.com/file/d/aaa/view';

\echo '--- 2. a second note with that link is refused ---'
\echo 'expect ERROR: documents_url_key_uniq'
insert into public.documents (kind, title, url) values ('service_note', 'dup', 'https://drive.google.com/file/d/AAA/view');

\echo '--- 3. a service manual with the same link is not constrained (url_key is null) ---'
\echo 'expect: INSERT 0 1'
insert into public.documents (kind, title, url) values ('service_manual', 'manual', 'https://drive.google.com/file/d/AAA/view');
