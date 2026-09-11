-- ===========================================================================
-- WHY IS THE PRODUCT SEARCH TIMING OUT? — read-only, safe to run any time.
--
-- Reported 2026-09-11: "Search failed: canceling statement due to statement
-- timeout" on Product Master, and real customers coming back as "nothing
-- matches" in the call request.
--
-- The same search runs in 7 ms against a rehearsal database of 22,000 machines,
-- so the answer is in THIS database and not in the query. This asks the four
-- questions that separate the possibilities and returns them as ONE table.
--
-- PASTE THE WHOLE THING INTO THE SUPABASE SQL EDITOR AND RUN IT. One result,
-- one screenshot. (The first version of this file used psql's \echo and \pset,
-- which the SQL editor does not have — it is not psql. Hence the rewrite.)
--
-- IT CHANGES NOTHING. The only thing it creates is a function in `pg_temp`,
-- the throwaway schema that exists for the length of one connection and cannot
-- outlive it — needed because EXPLAIN cannot otherwise be put in a UNION.
-- ===========================================================================

create or replace function pg_temp.explain_lines(q text)
returns setof text language plpgsql as $$
begin
  return query execute 'explain (analyze, buffers) ' || q;
end $$;

with
-- 1. HOW BIG IS IT REALLY? The rehearsal used 22,000 machines.
sizes as (
  select 1 as ord, 1 as seq, 'SIZE' as section, 'products' as item, count(*)::text as detail from public.products
  union all select 1, 2, 'SIZE', 'parties', count(*)::text from public.parties
  union all select 1, 3, 'SIZE', 'parts',   count(*)::text from public.parts
  union all select 1, 4, 'SIZE', 'distinct party names in products',
                 count(*)::text from (select distinct party_name from public.products) d
),
-- 2. ARE THE SEARCH INDEXES THERE? A trigram index is what makes `%term%`
--    possible at all. If one is missing, that search is a full table scan,
--    which is exactly what a statement timeout looks like.
idx as (
  select 2, row_number() over (order by indexname)::int, 'INDEX',
         indexname,
         (case when indexdef ilike '%gin%' or indexdef ilike '%trgm%'
                    then 'TRIGRAM (substring search)'
               when indexdef ilike '%unique%' then 'unique'
               else 'btree (exact match)' end)
         || ' · ' || pg_size_pretty(pg_relation_size(indexname::regclass))
    from pg_indexes
   where schemaname = 'public' and tablename = 'products'
),
-- Expected at minimum: a TRIGRAM index on serial_number, item_name and
-- party_name (0052), plus products_serial_key_idx (0037). Anything absent
-- from the list above is very likely the answer.
missing as (
  select 2, 900, 'INDEX', '>>> MISSING: ' || n,
         'this search can only be a full table scan'
    from (values ('products_serial_number_trgm'), ('products_item_name_trgm'),
                 ('products_party_name_trgm'), ('products_serial_key_idx')) v(n)
   where not exists (select 1 from pg_indexes
                      where schemaname='public' and tablename='products' and indexname = v.n)
),
-- 3. HOW LONG IS A STATEMENT ALLOWED TO RUN, for the role the app uses?
timeouts as (
  select 3, 1, 'TIMEOUT', coalesce(r.rolname, 'this session'),
         coalesce(array_to_string(s.setconfig, ' · '), current_setting('statement_timeout', true))
    from pg_roles r
    left join pg_db_role_setting s on s.setrole = r.oid
   where r.rolname in ('authenticated', 'anon', 'authenticator')
),
-- 4. WHAT DOES THE FAILING SEARCH ACTUALLY DO? Read the plan: "Seq Scan on
--    products" means no index was usable.
plan_three as (
  select 4, n::int, 'PLAN 1 · the three filters reported', l, ''
    from pg_temp.explain_lines($q$
      select * from public.products
       where serial_number ilike '%7680%'
         and party_name    ilike '%vivek%'
         and item_name     ilike '%monnal t75%'
       limit 200 $q$) with ordinality t(l, n)
),
plan_party as (
  select 5, n::int, 'PLAN 2 · the customer picker', l, ''
    from pg_temp.explain_lines($q$
      select party_name from public.product_party_names
       where party_name ilike '%medical college%'
       order by party_name limit 50 $q$) with ordinality t(l, n)
),
-- A SHORT SERIAL ON ITS OWN is the known trap (0129): four characters give a
-- trigram index almost no selectivity, so the planner reads the whole table.
plan_serial as (
  select 6, n::int, 'PLAN 3 · a short serial alone (the 0129 trap)', l, ''
    from pg_temp.explain_lines($q$
      select * from public.products
       where serial_number ilike '%7680%' limit 200 $q$) with ordinality t(l, n)
)
-- ORDERED BY THE SECTION AND THEN BY THE LINE'S OWN POSITION. An EXPLAIN sorted
-- alphabetically is not a plan, it is a word list — the first draft of this file
-- did exactly that.
select section, item, detail from (
  select * from sizes
  union all select * from idx
  union all select * from missing
  union all select * from timeouts
  union all select * from plan_three
  union all select * from plan_party
  union all select * from plan_serial
) all_of_it(ord, seq, section, item, detail)
order by ord, seq;

-- SEND BACK ALL OF IT. The row counts, the index list and the three plans
-- together say which of these it is: an index that is not there, a table far
-- larger than the rehearsal, or a time limit set shorter than the work.
