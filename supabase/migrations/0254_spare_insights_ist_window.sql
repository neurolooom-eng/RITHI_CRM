-- ===========================================================================
-- 0254 -- SPARE INSIGHTS COUNTS INDIA'S DAYS, NOT THE DATABASE'S (finding 13).
--
-- The window was `sc.created_at >= p_from::timestamptz` and
-- `< (p_to + 1)::timestamptz`. A date cast to timestamptz is midnight in the
-- DATABASE'S time zone. On a database in UTC that is 05:30 India time, so
-- consumption booked between midnight and 05:30 on the first day fell outside
-- the reader's window, and the same hours after the last day fell inside it.
-- `date_trunc('month', sc.created_at)` had the same fault: a spare booked
-- before 05:30 on the 1st was charted in the previous month.
--
-- Both now name Asia/Kolkata. The answer is therefore right WHATEVER the
-- database's time zone is, which is why this needs no decision: `show timezone`
-- on the live project (finding 26's open question) does not change it. On a
-- database already in Asia/Kolkata nothing moves.
--
-- The body is pg_get_functiondef's, read from a database built from every
-- migration, with those three expressions changed and nothing else (0148 is
-- the only other definition). CREATE OR REPLACE keeps the existing grants.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.spare_insights(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
  where sc.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
    and sc.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')     -- inclusive of p_to
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
   where sc.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
     and sc.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
     and coalesce(sc.qty, 0) > 0
   group by 1 order by 1
)
select jsonb_build_object(
  'from', p_from,
  'to',   p_to,
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
);
$function$

;
