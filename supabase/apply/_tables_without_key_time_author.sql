-- ===========================================================================
-- WHICH TABLES LACK A KEY, A TIMESTAMP OR AN AUTHOR?
--
-- READ-ONLY, no editing. Paste and run. One row per table in `public`.
--
-- The user's standing requirement (2026-09-26): every table carries a key, a
-- timestamp, sys_created_by and sys_updated_by. This probe measures how far
-- the project is from that, on the LIVE database rather than on one rebuilt
-- from the migrations. The two can differ, and the backlog is a record, not
-- evidence.
--
-- HOW TO READ THE COLUMNS
--   natural_key   a full unique index on something other than `id` alone.
--                 Every table already has a primary key, usually a synthetic
--                 `id`, so a table without a natural key cannot tell a second
--                 load of the same row from a new row.
--                 A PARTIAL or EXPRESSION unique index does not count here:
--                 an upload cannot use one as its conflict target. Such tables
--                 read 'partial/expression only'.
--   created_at / updated_at      the columns by those exact names.
--   any_timestamp                how many timestamp columns the table has
--                                under any name. 0 means the table cannot
--                                say WHEN anything in it happened.
--   created_by / updated_by      a column of that name, or sys_created_by /
--                                sys_updated_by, or calls' actual_created_by.
--                                NOTE: on calls, `created_by` is the Hotline
--                                DESK the call is filed to, not the person
--                                who typed it in (0114). A column being
--                                present does not mean it means "author".
--   text_dates    text columns whose NAME suggests a date. A date stored as
--                 text cannot be shown or exported as a real date without
--                 parsing it first. This is a NAME match only, so check before
--                 acting: `bill_generate_at` on the two contract tables
--                 matches, and it is a choice ("Beginning Of Period" /
--                 "End Of Period"), not a date.
-- ===========================================================================
with t as (
  select c.oid, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
), cols as (
  select a.attrelid as oid, a.attname, format_type(a.atttypid, a.atttypmod) as typ
    from pg_attribute a
   where a.attnum > 0 and not a.attisdropped
), uniq as (
  select i.indrelid as oid,
         i.indpred is null and i.indexprs is null as usable,
         array_agg(a.attname) as cols
    from pg_index i
    left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indisunique
   group by i.indexrelid, i.indrelid, i.indpred, i.indexprs
)
select
  t.relname                                                              as table_name,
  case
    when exists (select 1 from uniq u where u.oid = t.oid and u.usable
                  and not (u.cols <@ array['id']::name[]))              then 'yes'
    when exists (select 1 from uniq u where u.oid = t.oid and not u.usable) then 'partial/expression only'
    else 'NO'
  end                                                                    as natural_key,
  case when exists (select 1 from cols where oid = t.oid and attname = 'created_at')
       then 'yes' else 'NO' end                                          as created_at,
  case when exists (select 1 from cols where oid = t.oid and attname = 'updated_at')
       then 'yes' else 'NO' end                                          as updated_at,
  (select count(*) from cols where oid = t.oid and typ like 'timestamp%') as any_timestamp,
  coalesce((select string_agg(attname, ', ' order by attname) from cols
             where oid = t.oid
               and attname in ('created_by', 'actual_created_by', 'sys_created_by')),
           'NO')                                                         as created_by,
  coalesce((select string_agg(attname, ', ' order by attname) from cols
             where oid = t.oid and attname in ('updated_by', 'sys_updated_by')),
           'NO')                                                         as updated_by,
  coalesce((select string_agg(attname, ', ' order by attname) from cols
             where oid = t.oid and typ = 'text'
               and attname ~ '(date|_at$|_on$|time)'), '')               as text_dates
from t
order by t.relname;
