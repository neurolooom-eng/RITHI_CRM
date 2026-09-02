-- ===========================================================================
-- What state is this project actually in? Read-only — changes nothing.
-- Run this FIRST; it tells you which of the remaining scripts you still need.
-- ===========================================================================
select 'calls is a'                as check,
       case (select relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relname='calls')
            when 'r' then 'TABLE  -> the split has NOT been applied'
            when 'v' then 'VIEW   -> the split IS applied (field/installation/pm tables exist)'
            else 'missing' end     as result
union all
select 'split tables',
       coalesce((select string_agg(c.relname, ', ' order by c.relname)
                   from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public'
                    and c.relname in ('field_calls','installation_calls','pm_calls')), 'none')
union all
select 'PM fields (0050)',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='pm_calls' and column_name='reg_at')
             or exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='calls' and column_name='reg_at')
            then 'reg_at + added_on present -> pm_schedule_fields.sql already applied'
            else 'MISSING -> run pm_schedule_fields.sql' end
union all
select 'split hardening (0041)',
       -- 0041 adds <table>_type_ck on each split table
       case when (select count(*) from pg_constraint where conname like '%\_type\_ck') >= 3
            then 'present ('
                 || (select count(*) from pg_constraint where conname like '%\_type\_ck')::text
                 || ' CHECK constraints)'
            else 'MISSING -> run harden_call_split.sql (optional)' end
union all
select 'search indexes (0052)',
       (select count(*)::text || ' trigram + '
             || (select count(*) from pg_indexes where indexname like '%\_eq')::text || ' btree'
          from pg_indexes where indexname like '%\_trgm')
union all
select 'partial dispatch (0055/0056)',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='spare_request_lines' and column_name='received_qty')
            then 'applied' else 'MISSING' end
union all
select 'call re-open (0057/0058)',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname like '%reopen%')
            then 'applied' else 'MISSING -> the re-open feature on main needs it' end;
