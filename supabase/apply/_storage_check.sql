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
--
-- ⚠ "NEVER USED" IS ONLY TRUE SINCE STATISTICS WERE RESET, and Supabase resets
-- them on a restart or an upgrade. Section 0 prints WHEN, because without that
-- date the scan counts are not evidence of anything -- and an index dropped on
-- that reading is a table scan on every search afterwards. The first run of this
-- report showed every index at zero scans and `reports` at 8 live rows, which is
-- what a recent reset looks like: the row counts were nonsense, so the scan
-- counts were too. Row counts here are now EXACT (counted, not estimated) so
-- that tell is never available to be misread again.
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
         -- EXACT, not the planner's estimate: n_live_tup is a STATISTIC and is
         -- wiped with the rest on a reset, which is how a table with tens of
         -- thousands of rows reports 8. query_to_xml runs the count read-only.
         coalesce((xpath('/row/c/text()',
                   query_to_xml(format('select count(*) as c from public.%I', c.relname),
                                false, true, '')))[1]::text::bigint, 0) as live,
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

  select 0 as sort_order, 0 as rn,
         '0. READ THIS FIRST' as section,
         'statistics last reset' as item,
         coalesce(to_char(d.stats_reset, 'YYYY-MM-DD HH24:MI'), 'never recorded') as size,
         coalesce(age(now(), d.stats_reset)::text, '-') as rows,
         case when d.stats_reset is null or d.stats_reset > now() - interval '30 days'
              then 'RECENT -- the scan counts below are NOT evidence. An index shows '
                   || '0 scans because nothing has been counted yet, not because nothing '
                   || 'uses it. Do not drop an index on this reading.'
              else 'old enough that a 0-scan index is worth questioning -- but confirm '
                   || 'against how the app is actually used before dropping one.' end as note
    from pg_stat_database d where d.datname = current_database()

  union all
  select 1, 0,
         '1. TOTAL', 'database on disk',
         pg_size_pretty(bytes), '',
         'this is what the 500 MB cap is measured against'
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

  -- Every index over 1 MB, not just ten: on this database the indexes are the
  -- largest single cost, and a top-ten cuts the list off in the middle of it.
  union all
  select 3, rn::int,
         '3. INDEXES OVER 1 MB', index_name,
         pg_size_pretty(bytes),
         to_char(scans, 'FM9,999,999') || ' scans',
         'on ' || on_table
           || case when index_name like '%\_trgm' then '  [trigram: substring search]'
                   when index_name like '%\_uniq' or index_name like '%\_pkey'
                        then '  [UNIQUE/PK: an upsert needs it -- never drop on a scan count]'
                   else '' end
           || case when scans = 0 then '  -- 0 scans SINCE THE RESET IN SECTION 0' else '' end
    from top_indexes where bytes > 1024 * 1024

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
