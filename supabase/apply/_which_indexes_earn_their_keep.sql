-- ===========================================================================
-- WHICH INDEXES EARN THEIR KEEP? (2026-10-05)
--
-- READ-ONLY. Paste into the Supabase SQL editor and run. It prints ONE grid:
-- every index in `public`, biggest first, with how many times the planner has
-- used it since the statistics were last reset, how big it is, and a verdict.
-- Nothing here can be known from the repository: an index's SIZE and its SCAN
-- COUNT are facts about the live project and its traffic.
--
-- READ ROW 1 FIRST. It says when the counters were reset. A count of 0 on
-- an index created yesterday means nothing; 0 after three months of use is
-- an index that costs every write to its table and has never once been read.
--
-- WHAT THE VERDICTS MEAN
--   keep: unique / key     a primary key, a unique index or an upsert target.
--                          Never dropped for cost -- it is the rule, not a speed-up.
--   prefix of <name>       a non-unique btree whose columns are the leading
--                          columns of a wider index on the same table: the
--                          wider one answers the same lookups. 0382 dropped the
--                          eight this repository could see; one here is new.
--   unused since reset     0 scans. Read with row 1 -- and with the knowledge
--                          that a trigram index is used only by substring
--                          searches, which may be rare and still be the thing
--                          that keeps a search under the timeout.
--   trigram, <n> scans     one of the 0052 search indexes; the biggest on the
--                          project. Keep the ones that are scanned; the global
--                          call search ORs eleven of them per table.
--   used                   nothing to decide.
--
-- WHAT TO DO WITH IT: paste the grid back. A drop is a migration (the creator
-- is edited too, or a bundle replay puts it back), never a hand-run DROP.
-- ===========================================================================
with idx as (
  select n.nspname, c.relname as tbl, ic.relname as idx, i.indisunique as uniq, i.indisprimary as pk,
         am.amname,
         regexp_replace(pg_get_indexdef(i.indexrelid), '^.* USING \w+ \((.*)\)( WHERE .*)?$', '\1') as cols,
         coalesce(pg_get_expr(i.indpred, i.indrelid), '') as pred,
         pg_relation_size(i.indexrelid) as bytes,
         pg_relation_size(i.indrelid) as tbl_bytes,
         s.idx_scan, s.idx_tup_read
    from pg_index i
    join pg_class c  on c.oid = i.indrelid
    join pg_class ic on ic.oid = i.indexrelid
    join pg_am am    on am.oid = ic.relam
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_indexes s on s.indexrelid = i.indexrelid
   where n.nspname = 'public'
),
prefix as (
  select a.idx, min(b.idx) as wider
    from idx a join idx b on a.tbl = b.tbl and a.idx <> b.idx
     and a.amname = 'btree' and b.amname = 'btree' and a.pred = b.pred
     and not a.uniq and not a.pk
     and (b.cols = a.cols or b.cols like a.cols || ',%')
   group by a.idx
),
rows_ as (
  select 0 as sort_order,
         'STATISTICS RESET' as "table", coalesce(to_char(stats_reset, 'dd-Mon-yyyy HH24:MI'), 'never (since the database was created)') as "index",
         '' as "columns", '' as "size", null::bigint as "scans",
         'row 1: every scan count below is since this moment' as verdict
    from pg_stat_database where datname = current_database()
  union all
  select 1, i.tbl, i.idx, i.cols || case when i.pred <> '' then ' WHERE ' || i.pred else '' end,
         pg_size_pretty(i.bytes), i.idx_scan,
         case
           when i.pk or i.uniq then 'keep: unique / key'
           when p.wider is not null then 'prefix of ' || p.wider || ' -- drop candidate'
           when i.amname = 'gin' and i.cols like '%gin_trgm_ops%' then 'trigram, ' || coalesce(i.idx_scan, 0) || ' scans'
           when coalesce(i.idx_scan, 0) = 0 then 'unused since reset'
           else 'used'
         end
    from idx i left join prefix p on p.idx = i.idx
)
select "table", "index", "columns", "size", "scans", verdict
  from rows_
 order by sort_order, (case when sort_order = 0 then 0 else -(select bytes from idx where idx.idx = rows_."index") end), "table", "index";
