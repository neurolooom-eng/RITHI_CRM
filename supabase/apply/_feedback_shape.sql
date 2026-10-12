-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12): the shape of public.feedback, to mimic the
-- "Customer Feedback - 2025" workbook's satisfaction average in the Objective.
-- One grid.
-- ===========================================================================
with f as (select * from public.feedback),
k as (select key, value from f, jsonb_each_text(coalesce(f.answers, '{}'::jsonb)))
select n, item, value from (
  select 1 as n, 'rows' as item, count(*)::text as value from f
  union all select 2, 'distinct ucn', count(distinct ucn)::text from f
  union all select 3, 'rows with entry_at / visit_at / created_at',
         count(entry_at) || ' / ' || count(visit_at) || ' / ' || count(created_at) from f
  union all
  select 10 + row_number() over (order by y)::int, 'year (coalesce entry_at, visit_at, created_at) ' || y,
         c::text || ' rows, ' || u || ' ucns'
    from (select extract(year from coalesce(entry_at, visit_at, created_at))::int as y, count(*) c, count(distinct ucn) u from f group by 1) z
  union all
  select 30 + row_number() over (order by m)::int, '2025 month ' || m,
         c::text || ' rows, ' || u || ' ucns, by entry_at; by visit_at ' || coalesce(v::text, '0')
    from (select to_char(coalesce(entry_at, visit_at, created_at) at time zone 'Asia/Kolkata', 'YYYY-MM') as m, count(*) c, count(distinct ucn) u,
                 count(*) filter (where to_char(visit_at at time zone 'Asia/Kolkata', 'YYYY-MM') = to_char(coalesce(entry_at, visit_at, created_at) at time zone 'Asia/Kolkata', 'YYYY-MM')) v
            from f where coalesce(entry_at, visit_at, created_at) >= '2025-01-01' and coalesce(entry_at, visit_at, created_at) < '2026-01-01' group by 1) z
  union all
  select 60 + row_number() over (order by c desc)::int, 'call_type ' || coalesce(t, '(blank)'), c::text
    from (select call_type as t, count(*) c from f group by 1) z
  union all
  select 80 + row_number() over (order by c desc, key)::int, 'answer key ' || key, c::text || ' rows; values: ' || vals
    from (select key, count(*) c, string_agg(distinct left(value, 25), ' / ') filter (where length(value) < 26) as vals from k group by key) z
  union all
  select 200, 'imported_from values', string_agg(distinct coalesce(imported_from, '(none)'), ', ') from f
) x where n < 200 or true order by n;
