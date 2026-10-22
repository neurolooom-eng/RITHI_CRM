-- Read-only: can Machine History reach the history calls that carry a Service Report? One grid.
with h as (
  select h.*, nullif(btrim(h.extra->>'Service Report'), '') as rep,
         nullif(btrim(h.serial), '') as ser_col,
         coalesce(nullif(btrim(h.extra->>'Product Serial Number'), ''), nullif(btrim(h.extra->>'Item Serial Number'), ''),
                  nullif(btrim(h.extra->>'Serial No'), ''), nullif(btrim(h.extra->>'Serial Number'), '')) as ser_extra,
         nullif(btrim(h.item_name), '') as prod_col,
         coalesce(nullif(btrim(h.extra->>'Product Name'), ''), nullif(btrim(h.extra->>'Product'), ''), nullif(btrim(h.extra->>'Item Name'), '')) as prod_extra
    from public.call_history h
)
select * from (
  select 1 as row, 'history calls' as what, count(*)::text as value from h
  union all select 2, '... with a Service Report', count(*)::text from h where rep is not null
  union all select 3, '... with a Service Report AND the serial column filled', count(*)::text from h where rep is not null and ser_col is not null
  union all select 4, '... with a Service Report, serial column EMPTY but a serial in the kept columns', count(*)::text from h where rep is not null and ser_col is null and ser_extra is not null
  union all select 5, '... with a Service Report and no serial anywhere', count(*)::text from h where rep is not null and ser_col is null and ser_extra is null
  union all select 6, '... with a Service Report, product column EMPTY', count(*)::text from h where rep is not null and prod_col is null
  union all select 7, 'ALL history calls: serial column empty but a serial in the kept columns', count(*)::text from h where ser_col is null and ser_extra is not null
  union all select 8, 'ALL history calls: product column empty but a product in the kept columns', count(*)::text from h where prod_col is null and prod_extra is not null
  union all select 10 + row_number() over (), 'kept serial heading: ' || k, n::text
    from (select k, count(*) n from h, jsonb_object_keys(coalesce(h.extra, '{}'::jsonb)) k where k ilike '%serial%' or k ilike '%product%' or k ilike '%item%' group by k order by n desc limit 8) x
  union all select 30 + row_number() over (), 'rows with a report by source / register / serial column filled: ' || coalesce(source,'') || ' / ' || coalesce(register,'') || ' / ' || sc::text, n::text
    from (select source, register, (ser_col is not null) as sc, count(*) n from h where rep is not null group by 1,2,3) y
) z order by row;
