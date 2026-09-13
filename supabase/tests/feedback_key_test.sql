-- ===========================================================================
-- ONE FEEDBACK PER CALL (0186). Errors printed are labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo ''
\echo '=== 1. the UCN is the key -- a re-load corrects, it does not add ======'
insert into public.feedback (ucn, party_name) values ('24K29F0011','HOSP A');
insert into public.feedback (ucn, party_name) values ('24K29F0011','HOSP A CORRECTED')
  on conflict (ucn_key) do update set party_name = excluded.party_name;
select count(*) as should_be_1 from public.feedback;
select party_name as reads_corrected from public.feedback where ucn = '24K29F0011';

\echo ''
\echo '=== 2. the same call twice is still one record ======================='
\echo '    expect ERROR below -- one feedback per call'
insert into public.feedback (ucn, party_name) values ('24k29f0011','LOWER CASE');

\echo ''
\echo '=== 3. rows with NO ucn do not collide with each other ==============='
-- The first version of 0186 used a PARTIAL index to leave these alone, and
-- check:upserts refused it: a partial index is not inferable. A blank keys off
-- its own row instead, so the index is total AND no record is deleted.
insert into public.feedback (ucn, party_name) values ('','NO UCN ONE'), (null,'NO UCN TWO');
select count(*) as blanks_should_be_2 from public.feedback where coalesce(btrim(ucn),'') = '';
select count(distinct ucn_key) as distinct_keys_should_be_2 from public.feedback
 where coalesce(btrim(ucn),'') = '';

\echo ''
\echo '=== 4. the index is TOTAL, not partial =============================='
select count(*) as partial_should_be_0 from pg_indexes
 where schemaname = 'public' and indexname = 'feedback_ucn_key_uniq' and indexdef ilike '%where%';
select count(*) as index_should_be_1 from pg_indexes
 where schemaname = 'public' and indexname = 'feedback_ucn_key_uniq';
