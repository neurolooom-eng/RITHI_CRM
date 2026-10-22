-- Read-only: what Call History's "Service Report" (and similar) values look like. One grid.
with k as (
  select key, value from public.call_history h, jsonb_each_text(coalesce(h.extra, '{}'::jsonb))
   where key ilike '%report%' or key ilike '%pdf%' or key ilike '%attach%' or key ilike '%file%' or key ilike '%link%'
)
select * from (
  select 1 as row, 'key: ' || key as what, count(*)::text || ' rows, ' || count(*) filter (where btrim(value) <> '')::text || ' filled' as value from k group by key
  union all select 20 + row_number() over (), 'shape: ' || key || ' | ' ||
         case when value ~* '^https?://' then 'http link: ' || regexp_replace(value, '^(https?://[^/]+).*$', '\1')
              when value ~* '\.(pdf|jpe?g|png)$' then 'file name/path'
              when btrim(value) = '' then 'blank' else 'other' end, count(*)::text
    from k group by 2
  union all select 60 + row_number() over (), 'sample: ' || key || ' = ' || left(value, 160), ''
    from (select distinct on (key, (value ~* '^https?://')) key, value from k where btrim(value) <> '' order by key, (value ~* '^https?://'), value) s
) z order by row;
