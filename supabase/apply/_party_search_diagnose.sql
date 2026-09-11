-- ===========================================================================
-- WHY THE PARTY PICKER TIMES OUT — read-only, one result table.
--
-- Paste the whole file into the Supabase SQL editor and send the output back.
-- It runs AS `authenticated`, which is the point: a check that runs as the
-- owner is not a check (the KPI export measured 160 ms as owner and 27,273 ms
-- as a signed-in user).
--
-- Pure SQL. No psql meta-commands — those fail in the editor with 42601.
-- Nothing is written; the role is reset at the end.
-- ===========================================================================

create or replace function pg_temp.t(q text) returns numeric language plpgsql as $$
declare t0 timestamptz; begin
  t0 := clock_timestamp();
  begin execute 'explain (analyze, timing off, costs off) ' || q;
  exception when others then return -1; end;
  return round(extract(milliseconds from clock_timestamp() - t0)::numeric, 1);
end $$;

create or replace function pg_temp.p(q text) returns text language plpgsql as $$
declare l text; out text := ''; begin
  begin
    for l in execute 'explain (analyze, timing off, costs off) ' || q loop
      if l ~* '(Seq Scan|Index Scan|Bitmap Index Scan|Execution Time|rows=)' then
        out := out || btrim(l) || ' / ';
      end if;
    end loop;
  exception when others then return 'ERROR: ' || sqlerrm; end;
  return left(out, 400);
end $$;

-- NOT `set local`: outside a transaction that warns and does NOTHING, and a
-- diagnostic that silently measured as the OWNER would be worse than none --
-- that is the exact mistake the KPI export hid behind for weeks.
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
set role authenticated;
-- proof that it took, rather than an assumption:
select current_user as measuring_as;

with q(ord, question, answer) as (
  values
  (1, 'products / distinct parties / parties master',
      (select count(*)::text from public.products) || ' / ' ||
      (select count(distinct party_name)::text from public.products) || ' / ' ||
      (select count(*)::text from public.parties)),
  (2, 'statement_timeout in force here', current_setting('statement_timeout', true)),
  (3, 'trigram index on products.party_name?',
      coalesce((select 'yes: ' || indexname from pg_indexes
                 where schemaname='public' and tablename='products'
                   and indexdef ilike '%gin%party_name%' limit 1), 'NO — this alone would explain it')),
  (4, 'trigram index on parties.party_name?',
      coalesce((select 'yes: ' || indexname from pg_indexes
                 where schemaname='public' and tablename='parties'
                   and indexdef ilike '%gin%party_name%' limit 1), 'NO')),
  (5, 'products table size / bloat',
      pg_size_pretty(pg_table_size('public.products')) || ' table, ' ||
      pg_size_pretty(pg_indexes_size('public.products')) || ' indexes, last analyzed ' ||
      coalesce((select greatest(last_analyze, last_autoanalyze)::text from pg_stat_user_tables
                 where relname='products'), 'NEVER — run analyze public.products')),

  -- ---- THE OLD QUERY (what times out) ----------------------------------
  (10, 'OLD aggregate view, short term "vada"  ms',
       pg_temp.t($$select party_name from public.product_party_names where party_name ilike '%vada%' order by party_name limit 50$$)::text),
  (11, 'OLD aggregate view, common term "hos"  ms',
       pg_temp.t($$select party_name from public.product_party_names where party_name ilike '%hos%' order by party_name limit 50$$)::text),
  (12, 'OLD plan, common term',
       pg_temp.p($$select party_name from public.product_party_names where party_name ilike '%hos%' order by party_name limit 50$$)),

  -- ---- THE NEW QUERY (what ships) --------------------------------------
  (20, 'NEW capped scan, short term "vada"  ms',
       pg_temp.t($$select party_name from public.products where party_name ilike '%vada%' limit 1000$$)::text),
  (21, 'NEW capped scan, common term "hos"  ms',
       pg_temp.t($$select party_name from public.products where party_name ilike '%hos%' limit 1000$$)::text),
  (22, 'NEW plan, common term',
       pg_temp.p($$select party_name from public.products where party_name ilike '%hos%' limit 1000$$)),

  -- ---- THE PARTY MASTER (the completeness half) ------------------------
  (30, 'Party Master, common term "hos"  ms',
       pg_temp.t($$select party_name from public.parties where party_name ilike '%hos%' order by party_name limit 50$$)::text),

  -- ---- how many distinct names 1,000 machine rows yields ---------------
  (40, 'distinct customers in a 1,000-row scan of "hos"',
       (select count(distinct party_name)::text from
          (select party_name from public.products where party_name ilike '%hos%' limit 1000) s))
)
select ord, question, answer from q order by ord;

reset role;
