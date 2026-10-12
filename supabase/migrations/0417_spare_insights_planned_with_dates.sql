-- ===========================================================================
-- 0417 -- SPARE INSIGHTS IS PLANNED WITH ITS DATES (D-166; reported 2026-10-12:
-- the page showed "canceling statement due to statement timeout" for
-- 01-Jan-2026 .. 12-Oct-2026).
--
-- Measured on the live project as the signed-in admin (row-level security on,
-- _spare_insights_timeout.sql): the page's query with the dates written in
-- runs in 0.37 s. The SAME query planned without knowing them -- which is how
-- a SQL-language function plans its body -- runs in 26.8 s: the generic plan
-- guesses 12 consumption lines in the window where there are 9,002, and so
-- chooses nested loops, re-reading the Part Master 9,002 times and matching
-- the calls row by row. The year's consumption outgrew the guess.
--
-- The fix is 0359's: the function becomes plpgsql and runs its query with
-- EXECUTE ... USING, which is planned with the real dates every time. The
-- query is 0254's body, read out of a database built from every migration,
-- WORD FOR WORD with p_from / p_to as $1 / $2 -- the same rule, the same answer.
-- It stays SECURITY INVOKER: the reader's own row-level security bounds it,
-- as before.
-- ===========================================================================
create or replace function public.spare_insights(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = public
as $function$
declare v jsonb;
begin
  execute $q$
with lines as (
  select
    upper(btrim(split_part(sc.part, '|', 1)))                          as part_code,
    btrim(coalesce(nullif(split_part(sc.part, '|', 2), ''), sc.part))  as part_name,
    coalesce(sc.qty, 0)                                                as qty,
    sc.ucn,
    sc.engineer,
    c.product_name,
    c.item_status,
    c.party_name
  from public.spare_consumption sc
  left join public.calls c on c.ucn = sc.ucn
  where sc.created_at >= ($1::timestamp at time zone 'Asia/Kolkata')
    and sc.created_at <  (($2 + 1)::timestamp at time zone 'Asia/Kolkata')     -- inclusive of $2
    and coalesce(sc.qty, 0) > 0                      -- a voided line is not consumption
),
priced as (
  select l.*,
         coalesce(nullif(btrim(p.category), ''), 'Unclassified') as category
    from lines l
    left join public.parts p
      on upper(btrim(p.code)) = l.part_code
),
by_part as (
  select part_code, min(part_name) as part_name, sum(qty) as qty,
         count(distinct ucn) as calls, min(category) as category
    from priced group by part_code order by sum(qty) desc, part_code limit 25
),
by_cover as (
  select coalesce(nullif(btrim(item_status), ''), '— not set —') as cover,
         sum(qty) as qty, count(distinct ucn) as calls, count(*) as lines
    from priced group by 1 order by sum(qty) desc
),
by_product as (
  select coalesce(nullif(btrim(product_name), ''), '— not set —') as product,
         sum(qty) as qty, count(*) as lines, count(distinct ucn) as calls,
         count(distinct part_code) as parts
    from priced group by 1 order by sum(qty) desc, 1 limit 25
),
by_category as (
  select category, sum(qty) as qty, count(*) as lines, count(distinct part_code) as parts
    from priced group by 1 order by sum(qty) desc
),
by_month as (
  -- The shape of the window, so a spike has somewhere to show.
  select to_char(date_trunc('month', sc.created_at at time zone 'Asia/Kolkata'), 'YYYY-MM') as month,
         sum(coalesce(sc.qty, 0)) as qty
    from public.spare_consumption sc
   where sc.created_at >= ($1::timestamp at time zone 'Asia/Kolkata')
     and sc.created_at <  (($2 + 1)::timestamp at time zone 'Asia/Kolkata')
     and coalesce(sc.qty, 0) > 0
   group by 1 order by 1
)
select jsonb_build_object(
  'from', $1,
  'to',   $2,
  'total', (select jsonb_build_object(
              'qty',   coalesce(sum(qty), 0),
              'lines', count(*),
              'parts', count(distinct part_code),
              'calls', count(distinct ucn),
              -- WHAT THE CATEGORY SPLIT IS BUILT ON. Shown on the screen, so a
              -- consumable/spare figure is read next to how much of the
              -- catalogue has actually been classified.
              'unclassified_lines', count(*) filter (where category = 'Unclassified'),
              'unclassified_qty',   coalesce(sum(qty) filter (where category = 'Unclassified'), 0)
            ) from priced),
  'by_part',     (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from by_part b),
  'by_cover',    (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from by_cover b),
  'by_product',  (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from by_product b),
  'by_category', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from by_category b),
  'by_month',    (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from by_month b)
)
  $q$ into v using p_from, p_to;
  return v;
end $function$;
grant execute on function public.spare_insights(date, date) to authenticated;
