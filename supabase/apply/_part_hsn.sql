-- ===========================================================================
-- WHERE IS THE HSN CODE ON A PART? -- one grid, READ-ONLY.
--
-- The user, 2026-10-01: "Add HSN Code Column in Part Master. Identify the HSN
-- Code that is present as part of the Description and fill it in [one time
-- activity]." Before writing the rule that lifts it out, this shows how the
-- descriptions actually carry it -- the word, the separator, the digits --
-- and whether the Item Master import already kept an HSN column in `extra`.
--
-- Rows 1-9 are counts; rows 101+ are real descriptions, with the HSN word;
-- 201+ with an 8-digit run but no HSN word; 301+ any extra key naming HSN.
-- Nothing to change; paste and run.
-- ===========================================================================
with p as (
  select id, code, coalesce(description, '') as d, coalesce(item_detail, '') as det, coalesce(extra, '{}'::jsonb) as x, active
    from public.parts
),
k as (select distinct key from p, jsonb_object_keys(case when jsonb_typeof(x) = 'object' then x else '{}'::jsonb end) key)
select row_no, what, n, sample from (
  select 1 as row_no, 'parts' as what, count(*)::text as n, '' as sample from p
  union all select 2, 'active parts', count(*)::text, '' from p where active
  union all select 3, 'description mentions HSN', count(*)::text, '' from p where d ~* 'hsn'
  union all select 4, 'item_detail mentions HSN', count(*)::text, '' from p where det ~* 'hsn'
  union all select 5, 'description has HSN followed by digits', count(*)::text, '' from p where d ~* 'hsn[^0-9]{0,12}[0-9]{4,8}'
  union all select 6, 'description has an 8-digit run', count(*)::text, '' from p where d ~ '(^|[^0-9])[0-9]{8}([^0-9]|$)'
  union all select 7, 'description has 8 digits but no HSN word', count(*)::text, '' from p where d ~ '(^|[^0-9])[0-9]{8}([^0-9]|$)' and d !~* 'hsn'
  union all select 8, 'extra keys naming HSN', count(*)::text, string_agg(key, ' | ') from k where key ~* 'hsn'
  union all select 9, 'parts with an HSN extra value', count(*)::text, '' from p, jsonb_each_text(case when jsonb_typeof(x) = 'object' then x else '{}'::jsonb end) e where e.key ~* 'hsn' and btrim(e.value) <> ''
  union all select * from (select 100 + row_number() over (order by id)::int, code, '', d from p where d ~* 'hsn' order by id limit 60) a
  union all select * from (select 200 + row_number() over (order by id)::int, code, '', d from p where d ~ '(^|[^0-9])[0-9]{8}([^0-9]|$)' and d !~* 'hsn' order by id limit 25) b
  union all select * from (select 300 + row_number() over (order by p.id)::int, p.code, e.key, e.value from p, jsonb_each_text(case when jsonb_typeof(p.x) = 'object' then p.x else '{}'::jsonb end) e where e.key ~* 'hsn' and btrim(e.value) <> '' order by p.id limit 25) c
) r
order by row_no;
