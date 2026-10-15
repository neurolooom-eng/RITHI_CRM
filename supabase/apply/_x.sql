-- Read-only probe: every column holding harshavardhan.singh@airliquide.com
-- (old) or harshvardhan.singh@airliquide.com (new), base tables only.
with cols as (
  select c.table_schema, c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
   where c.table_schema in ('public', 'auth')
     and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY', 'USER-DEFINED')
     and c.udt_name not in ('vector', 'tsvector')
), hits as (
  select table_schema, table_name, column_name,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I where lower(%I::text) like %L',
            table_schema, table_name, column_name, '%harshavardhan.singh@airliquide.com%'), false, true, '')))[1]::text::int as old_n,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I where lower(%I::text) like %L',
            table_schema, table_name, column_name, '%harshvardhan.singh@airliquide.com%'), false, true, '')))[1]::text::int as new_n
    from cols
)
select table_schema || '.' || table_name as tbl, column_name, old_n, new_n
  from hits where old_n > 0 or new_n > 0
 order by 1, 2;
