-- ===========================================================================
-- WHAT DO THE FEEDBACK RECORDS SAY ABOUT THE WARRANTY START?  (read-only, one grid)
--
-- The user, 2026-10-03: the engineer's choice of where an installed machine's
-- warranty starts -- the documented date (PO / Warranty Sale Entry) or the
-- installation call's solved date -- "is part of customer feedback". Before the
-- Product Database is made to follow that choice, this lists what the feedback
-- actually holds: every answer key whose name mentions WARRANTY, each distinct
-- value with how often it appears, split by call type, and one example UCN.
--
-- Row 1 is the number of feedback records read. Rows 101+ are the values, most
-- frequent first (up to 200). Nothing here writes.
-- ===========================================================================
with a as (
  select f.ucn, upper(coalesce(f.call_type, '')) as call_type, e.key, btrim(e.value) as value
    from public.feedback f, jsonb_each_text(coalesce(f.answers, '{}'::jsonb)) e
   where e.key ilike '%warranty%'
),
g as (
  select key, value, call_type, count(*) as n, min(ucn) as example
    from a group by key, value, call_type
),
rows as (
  select 1 as row, 'feedback records read' as answer_key, '' as value, '' as call_type,
         (select count(*) from public.feedback)::text as how_many, '' as example_ucn
  union all
  select 100 + row_number() over (order by n desc, key, value) as row, key, coalesce(nullif(value, ''), '(blank)'),
         call_type, n::text, coalesce(example, '')
    from g
)
select * from rows where row < 301 order by row;
