-- ===========================================================================
-- WHERE THE DATABASE STORAGE HAS GONE. READ-ONLY -- it changes nothing.
--
-- ONE QUERY, ONE RESULT, like `_status.sql`. The Supabase SQL Editor is not
-- psql: `\echo` and `\pset` are psql's own commands and it rejects them with a
-- syntax error at the backslash. Every check file in this project is a single
-- statement for that reason.
--
-- Run this BEFORE deciding anything about the 500 MB cap. Splitting the data
-- across two Supabase projects is a permanent architectural cost -- no joins
-- between them, no shared RLS, no `auth.uid()` in common, and none of the apply
-- bundles or check scripts can see across the boundary. It is worth paying only
-- if the space is genuinely in use, and the first question is whether it is.
--
-- What counts toward the cap is DISK, so indexes and dead rows count as much as
-- live data. Three things routinely account for most of it and none of them is
-- real information:
--
--   * a row-level audit table holding a full jsonb copy of every version of
--     every row (an UPDATE stores the old row AND the new one);
--   * INDEXES, which on a narrow, heavily-indexed table often outweigh it;
--   * DEAD ROWS left by updates and deletes, which autovacuum marks reusable
--     but does not hand back to the operating system. A plain VACUUM does not
--     return them; only VACUUM FULL does, and it takes an ACCESS EXCLUSIVE lock
--     -- an out-of-hours job, not a live one.
--
-- Supabase counts DATABASE disk here. File storage (the Storage buckets) is a
-- separate allowance, and this project does not use it: uploads go to Google
-- Drive through the Apps Script bridge, so no attachment sits in Postgres.
-- ===========================================================================
with
db as (
  select pg_database_size(current_database()) as bytes
),
tbl as (
  select c.oid, c.relname,
         pg_total_relation_size(c.oid) as total,
         pg_table_size(c.oid)          as heap,
         pg_indexes_size(c.oid)        as idx,
         coalesce(s.n_live_tup, 0)     as live,
         coalesce(s.n_dead_tup, 0)     as dead
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
   where n.nspname = 'public' and c.relkind = 'r'
),
ind as (
  select c.relname as index_name, t.relname as on_table,
         pg_relation_size(c.oid) as bytes,
         coalesce(s.idx_scan, 0) as scans
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_index i     on i.indexrelid = c.oid
    join pg_class t     on t.oid = i.indrelid
    left join pg_stat_user_indexes s on s.indexrelid = c.oid
   where n.nspname = 'public' and c.relkind = 'i'
),
-- Each top-N slice is ranked in its own CTE: `order by` is not legal inside a
-- UNION arm, so the ranking has to happen before the arms are combined.
top_tables as (
  select row_number() over (order by total desc) as rn, * from tbl
),
top_indexes as (
  select row_number() over (order by bytes desc) as rn, * from ind
),
dead_rows as (
  select row_number() over (order by n_dead_tup desc) as rn,
         relname, n_live_tup, n_dead_tup, relid, last_autovacuum
    from pg_stat_user_tables where n_dead_tup > 1000
)
select section, item, size, rows, note from (

  select 1 as sort_order, 0 as rn,
         '1. TOTAL' as section, 'database on disk' as item,
         pg_size_pretty(bytes) as size, '' as rows,
         'this is what the 500 MB cap is measured against' as note
    from db

  union all
  select 2, rn::int,
         '2. TABLES (biggest first)', relname,
         pg_size_pretty(total),
         to_char(live, 'FM9,999,999') || ' live'
           || case when dead > 0 then ' / ' || to_char(dead, 'FM9,999,999') || ' dead' else '' end,
         round(100.0 * total / nullif((select bytes from db), 0), 1) || '% of db'
           || ' -- heap+toast ' || pg_size_pretty(heap)
           || ', indexes ' || pg_size_pretty(idx)
           || case when idx > heap and heap > 8192 then '  <-- indexes outweigh the table' else '' end
    from top_tables where rn <= 25

  union all
  select 3, rn::int,
         '3. BIGGEST INDEXES', index_name,
         pg_size_pretty(bytes),
         to_char(scans, 'FM9,999,999') || ' scans',
         'on ' || on_table
           || case when scans = 0 then '  <-- NEVER used since stats were reset' else '' end
    from top_indexes where rn <= 10

  -- 4 -- record_audit (0048): a full jsonb copy of every row on every insert,
  -- update and delete -- an UPDATE wrote the old row AND the new one -- across
  -- every bulk upload this project has run, with three indexes on top. 0112
  -- STOPPED the trigger and RETAINED the table, so nothing writes to it now and
  -- only an admin screen reads it. It is still an audit trail and this file
  -- does not touch it; its size is simply the first number worth knowing.
  --
  -- READ ENTIRELY FROM THE CATALOGS. `pg_total_relation_size('public.x')` casts
  -- to regclass at PLAN time and `select count(*) from public.x` needs the table
  -- to parse -- either would kill the WHOLE report on a project that does not
  -- have it. That trap has bitten this file's sibling `_status.sql` twice. The
  -- row count is therefore the planner's estimate, which is what a size report
  -- needs anyway.
  union all
  select 4, 1,
         '4. record_audit (nothing writes to it since 0112)',
         'public.record_audit',
         pg_size_pretty(t.total),
         '~' || to_char(t.live, 'FM9,999,999') || ' rows (estimate)',
         'triggers still writing to it: '
           || (select count(*)::text from pg_trigger tg
                 join pg_proc p on p.oid = tg.tgfoid
                where p.proname = 'record_audit_fn' and not tg.tgisinternal)
           || ' (expect 0 -- if not, 0112 was never applied here and it is still growing)'
    from tbl t where t.relname = 'record_audit'

  union all
  select 4, 2,
         '4. record_audit (nothing writes to it since 0112)',
         'not present on this project', '-', '-',
         'nothing to reclaim here'
   where not exists (select 1 from tbl where relname = 'record_audit')

  union all
  select 5, rn::int,
         '5. DEAD ROWS (space marked reusable, never returned to disk)',
         relname,
         pg_size_pretty(pg_total_relation_size(relid)),
         to_char(n_dead_tup, 'FM9,999,999') || ' dead of '
           || to_char(n_live_tup + n_dead_tup, 'FM9,999,999'),
         round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) || '% dead'
           || ' -- last autovacuum '
           || coalesce(to_char(last_autovacuum, 'YYYY-MM-DD'), 'never')
    from dead_rows where rn <= 15

) r
 order by sort_order, rn;
