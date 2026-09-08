-- ===========================================================================
-- WHERE THE DATABASE STORAGE HAS GONE. READ-ONLY -- it changes nothing.
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
--   * INDEXES, which on a wide table often outweigh the table;
--   * DEAD ROWS left by updates and deletes, which autovacuum marks reusable
--     but does not hand back to the operating system.
--
-- Sections 1-3 are the answer; 4 and 5 are the two specific suspects in this
-- database.
-- ===========================================================================
\pset pager off

\echo ''
\echo '=== 1. TOTAL, and what the 500 MB cap is measured against ==============='
select pg_size_pretty(pg_database_size(current_database())) as database_on_disk;

\echo ''
\echo '=== 2. EVERY TABLE, BIGGEST FIRST ======================================='
\echo 'total = heap + indexes + toast (the out-of-line store for big values).'
\echo 'A table whose INDEXES exceed its heap is normal for a narrow, heavily'
\echo 'indexed table and suspicious for a wide one.'
select
  c.relname                                             as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid))         as total,
  pg_size_pretty(pg_table_size(c.oid))                  as heap_and_toast,
  pg_size_pretty(pg_indexes_size(c.oid))                as indexes,
  to_char(coalesce(s.n_live_tup, 0), 'FM9,999,999')     as live_rows,
  to_char(coalesce(s.n_dead_tup, 0), 'FM9,999,999')     as dead_rows,
  round(100.0 * pg_total_relation_size(c.oid)
        / nullif(pg_database_size(current_database()), 0), 1) as pct_of_db
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
 where n.nspname = 'public' and c.relkind = 'r'
 order by pg_total_relation_size(c.oid) desc
 limit 30;

\echo ''
\echo '=== 3. THE TEN BIGGEST INDEXES ========================================='
\echo 'A trigram (gin) index for substring search is often several times the'
\echo 'size of the column it covers. An index nothing uses is pure cost:'
\echo 'idx_scan = 0 means it has never been read since statistics were reset.'
select
  c.relname                                     as index_name,
  t.relname                                     as on_table,
  pg_size_pretty(pg_relation_size(c.oid))       as size,
  coalesce(s.idx_scan, 0)                       as times_used,
  case when coalesce(s.idx_scan, 0) = 0
       then 'never used since stats were reset' else '' end as note
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i     on i.indexrelid = c.oid
  join pg_class t     on t.oid = i.indrelid
  left join pg_stat_user_indexes s on s.indexrelid = c.oid
 where n.nspname = 'public' and c.relkind = 'i'
 order by pg_relation_size(c.oid) desc
 limit 10;

\echo ''
\echo '=== 4. SUSPECT ONE: record_audit ======================================='
\echo 'record_audit (0048) stored a FULL jsonb copy of every row on every'
\echo 'insert, update and delete -- an UPDATE wrote the old row AND the new one'
\echo '-- across every bulk upload this project has ever run. 0112 STOPPED the'
\echo 'trigger; the table was retained. So nothing writes to it any more and the'
\echo 'only reader is an admin screen.'
\echo ''
\echo 'It is still an audit trail, and this file will not touch it. What to do'
\echo 'with it is a decision for whoever owns the quality record -- but its size'
\echo 'is the first number worth knowing.'
select
  case when to_regclass('public.record_audit') is null
       then 'record_audit does not exist on this project'
       else 'record_audit' end                       as table_name,
  coalesce(pg_size_pretty(pg_total_relation_size('public.record_audit')), '-') as total,
  coalesce((select to_char(count(*), 'FM9,999,999') from public.record_audit), '-') as rows,
  coalesce((select to_char(max(changed_at), 'YYYY-MM-DD') from public.record_audit), '-') as last_written,
  coalesce((select count(*)::text from pg_trigger tg
             join pg_proc p on p.oid = tg.tgfoid
            where p.proname = 'record_audit_fn' and not tg.tgisinternal), '0') as triggers_still_writing
 where to_regclass('public.record_audit') is not null
union all
select 'record_audit does not exist on this project', '-', '-', '-', '-'
 where to_regclass('public.record_audit') is null;

\echo ''
\echo 'expect triggers_still_writing = 0. If it is NOT zero, 0112 has not been'
\echo 'applied here and the table is still growing.'

\echo ''
\echo '=== 5. SUSPECT TWO: DEAD ROWS ========================================='
\echo 'Space that autovacuum has marked reusable but never returned to the disk.'
\echo 'It counts toward the cap. A plain VACUUM does NOT give it back; only'
\echo 'VACUUM FULL does, and that takes an ACCESS EXCLUSIVE lock -- the table is'
\echo 'unreadable while it runs, so it is an out-of-hours job, not a live one.'
select
  relname                                          as table_name,
  to_char(n_live_tup, 'FM9,999,999')               as live_rows,
  to_char(n_dead_tup, 'FM9,999,999')               as dead_rows,
  round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as pct_dead,
  pg_size_pretty(pg_total_relation_size(relid))    as total,
  coalesce(to_char(last_autovacuum, 'YYYY-MM-DD'), 'never') as last_autovacuum
  from pg_stat_user_tables
 where n_dead_tup > 1000
 order by n_dead_tup desc
 limit 15;

\echo ''
\echo '=== 6. WHAT THIS DOES NOT MEASURE ====================================='
\echo 'Supabase counts DATABASE disk here. File storage (the Storage buckets) is'
\echo 'a separate allowance -- and this project does not use it: uploads go to'
\echo 'Google Drive through the Apps Script bridge, so no attachment is sitting'
\echo 'in Postgres.'
\echo ''
\echo 'Nothing above was changed. Every statement in this file is a SELECT.'
