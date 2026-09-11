-- ===========================================================================
-- WHY IS THE PRODUCT SEARCH TIMING OUT? — read-only, safe to run any time.
--
-- Reported 2026-09-11: "Search failed: canceling statement due to statement
-- timeout" on Product Master, and real customers coming back as "nothing
-- matches" in the call request.
--
-- The same search shape runs in 7 ms against a rehearsal database of 22,000
-- machines, so the answer is in THIS database and not in the query. This file
-- asks it the four questions that separate the possibilities, and prints them.
--
-- IT CHANGES NOTHING. Every statement is a SELECT or an EXPLAIN.
-- ===========================================================================
\pset pager off
\timing on

\echo '=============================================================='
\echo '1. HOW BIG IS IT REALLY? (the rehearsal used 22,000 machines)'
\echo '=============================================================='
select 'products' as table_name, count(*) as rows from public.products
union all select 'parties',  count(*) from public.parties
union all select 'parts',    count(*) from public.parts
union all select 'distinct party names in products',
       count(*) from (select distinct party_name from public.products) d;

\echo ''
\echo '=============================================================='
\echo '2. ARE THE SEARCH INDEXES ACTUALLY THERE?'
\echo '   A trigram index is what makes `%term%` possible at all. If'
\echo '   any of these is missing, every search is a full table scan —'
\echo '   which is exactly what a statement timeout looks like.'
\echo '=============================================================='
select indexname,
       case when indexdef ilike '%gin%' or indexdef ilike '%trgm%' then 'trigram (substring search)'
            when indexdef ilike '%unique%' then 'unique'
            else 'btree (exact match)' end as kind,
       pg_size_pretty(pg_relation_size(indexname::regclass)) as size
  from pg_indexes
 where schemaname = 'public' and tablename = 'products'
 order by 2, 1;

\echo ''
\echo 'Expected, at minimum: a trigram index on serial_number, item_name and'
\echo 'party_name (0052), products_serial_key_idx (0037) and'
\echo 'products_party_name_group_idx (0160). Anything absent is the answer.'

\echo ''
\echo '=============================================================='
\echo '3. HOW LONG IS A STATEMENT ALLOWED TO RUN?'
\echo '=============================================================='
select rolname, setconfig
  from pg_roles r left join pg_db_role_setting s on s.setrole = r.oid
 where rolname in ('authenticated', 'anon', 'authenticator')
    or rolname = current_user;
select current_setting('statement_timeout', true) as statement_timeout_here;

\echo ''
\echo '=============================================================='
\echo '4. WHAT DOES THE FAILING SEARCH ACTUALLY DO?'
\echo '   The three filters from the report: party "vivek", product'
\echo '   "monnal t75", serial "7680". Read the top line: a Seq Scan on'
\echo '   products means no index was usable.'
\echo '=============================================================='
explain (analyze, buffers)
select * from public.products
 where serial_number ilike '%7680%'
   and party_name    ilike '%vivek%'
   and item_name     ilike '%monnal t75%'
 limit 200;

\echo ''
\echo '--- and the one behind the customer picker on a call request ---'
explain (analyze, buffers)
select party_name from public.product_party_names
 where party_name ilike '%medical college%'
 order by party_name limit 50;

\echo ''
\echo '--- and a SHORT serial on its own, which is the known trap (0129):'
\echo '--- four characters give a trigram index almost no selectivity.'
explain (analyze, buffers)
select * from public.products where serial_number ilike '%7680%' limit 200;

\echo ''
\echo '=============================================================='
\echo 'WHAT TO SEND BACK: all of it. The row counts, the index list and'
\echo 'the three plans together say which of these it is — a missing'
\echo 'index, a table far larger than the rehearsal, or a timeout set'
\echo 'shorter than the work.'
\echo '=============================================================='
