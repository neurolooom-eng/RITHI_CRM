-- ===========================================================================
-- Search performance. The app searches with substring ILIKE ('%term%') across
-- products, parties and the call registers. A leading wildcard cannot use the
-- existing lower(col) btree indexes, so every search seq-scans the whole table
-- and, once the tables grew, hit the API statement timeout ("canceling
-- statement due to statement timeout") on every page.
--
-- pg_trgm trigram GIN indexes make substring/ILIKE matching index-backed. This
-- block installs pg_trgm and adds a trigram index for each searched column that
-- exists, on each base table that exists — so it works before or after the call
-- split (0040): the `calls` VIEW is skipped, its base tables are indexed.
-- Idempotent (create index if not exists); safe to re-run.
-- ===========================================================================

create extension if not exists pg_trgm;

do $$
declare
  trgm text;   -- schema pg_trgm actually lives in (extensions on Supabase)
  rec  record;
  idx  text;
begin
  select quote_ident(n.nspname) into trgm
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if trgm is null then raise notice 'pg_trgm not available — skipping'; return; end if;

  for rec in
    select tbl, col from (values
      ('products','serial_number'), ('products','item_name'), ('products','party_name'),
      ('parties','party_name'),
      ('field_calls','ucn'), ('field_calls','call_number'), ('field_calls','party_name'),
      ('field_calls','serial'), ('field_calls','product_name'), ('field_calls','allocated_to'),
      ('field_calls','city'), ('field_calls','state'), ('field_calls','standard_complaint'),
      ('field_calls','complaint_reported'), ('field_calls','customer_name'),
      ('installation_calls','ucn'), ('installation_calls','call_number'), ('installation_calls','party_name'),
      ('installation_calls','serial'), ('installation_calls','product_name'), ('installation_calls','allocated_to'),
      ('installation_calls','city'), ('installation_calls','state'), ('installation_calls','standard_complaint'),
      ('installation_calls','complaint_reported'), ('installation_calls','customer_name'),
      ('pm_calls','ucn'), ('pm_calls','call_number'), ('pm_calls','party_name'),
      ('pm_calls','serial'), ('pm_calls','product_name'), ('pm_calls','allocated_to'),
      ('pm_calls','city'), ('pm_calls','state'), ('pm_calls','standard_complaint'),
      ('pm_calls','complaint_reported'), ('pm_calls','customer_name'),
      ('calls','ucn'), ('calls','call_number'), ('calls','party_name'),
      ('calls','serial'), ('calls','product_name'), ('calls','allocated_to'),
      ('calls','city'), ('calls','state'), ('calls','standard_complaint'),
      ('calls','complaint_reported'), ('calls','customer_name')
    ) as v(tbl, col)
  loop
    -- table must exist and be an ordinary table (skip the calls VIEW after split)
    if to_regclass('public.' || rec.tbl) is null then continue; end if;
    if (select relkind from pg_class where oid = ('public.' || rec.tbl)::regclass) <> 'r' then continue; end if;
    -- column must exist on it
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = rec.tbl and column_name = rec.col) then
      continue;
    end if;
    idx := rec.tbl || '_' || rec.col || '_trgm';
    execute format('create index if not exists %I on public.%I using gin (%I %s.gin_trgm_ops)',
                   idx, rec.tbl, rec.col, trgm);
  end loop;
end $$;

-- Btree indexes for the EXACT-match / IN lookups (a trigram index does not
-- serve `=`/`IN`): the request cascade filters products by party_name (and
-- item_name) with eq, and openCallsFor looks up calls by serial / party_name
-- with IN. Without these, those lookups seq-scan and time out too.
do $$
declare rec record; idx text;
begin
  for rec in
    select tbl, col from (values
      ('products','party_name'), ('products','item_name'),
      ('field_calls','serial'), ('field_calls','party_name'),
      ('installation_calls','serial'), ('installation_calls','party_name'),
      ('pm_calls','serial'), ('pm_calls','party_name'),
      ('calls','serial'), ('calls','party_name')
    ) as v(tbl, col)
  loop
    if to_regclass('public.' || rec.tbl) is null then continue; end if;
    if (select relkind from pg_class where oid = ('public.' || rec.tbl)::regclass) <> 'r' then continue; end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = rec.tbl and column_name = rec.col) then
      continue;
    end if;
    idx := rec.tbl || '_' || rec.col || '_eq';
    execute format('create index if not exists %I on public.%I (%I)', idx, rec.tbl, rec.col);
  end loop;
end $$;

-- Refresh planner stats so the new indexes are used right away.
do $$
declare t text;
begin
  foreach t in array array['products','parties','field_calls','installation_calls','pm_calls','calls'] loop
    if to_regclass('public.' || t) is not null
       and (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'r' then
      execute 'analyze public.' || quote_ident(t);
    end if;
  end loop;
end $$;
