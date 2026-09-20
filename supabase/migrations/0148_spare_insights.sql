-- ===========================================================================
-- SPARE INSIGHTS — what is being consumed, against what cover, on which
-- products, and whether it is a consumable or a spare.
--
-- The user, 2026-09-08: "Give me an Insight on the Spares Consumed - Default
-- the Consumption date to 1Jan2026 to Today - Selectable. Spares Consumed -
-- Highest Consumption ; Same against Product Item Status ; Then by Products
-- (Count of Spares Consumed) -- Also Categorize them as Consumable and Spare".
--
-- THE CATEGORY DID NOT EXIST, and this is the part worth saying out loud.
-- `parts` has code, description and item detail and nothing that says whether a
-- thing is a consumable or a spare; no master list defines it either. Three
-- ways to answer that:
--
--   1. GUESS FROM THE DESCRIPTION -- "filter", "kit", "sensor". It would have
--      filled the chart today and been wrong in a way nobody could see: a
--      figure derived from a keyword match reads exactly like one derived from
--      a decision, and this one lands next to consumption figures people act
--      on. Not done.
--   2. ASK, AND BUILD NOTHING until the answer arrives.
--   3. MAKE IT DATA, default it to UNCLASSIFIED, and show how much is
--      unclassified on the screen itself.
--
-- Three. `parts.category` is set on Part Master, one part at a time or in bulk,
-- and until somebody sets it a part is Unclassified and SAYS SO. A dashboard
-- that reports "60% consumables" out of a catalogue nobody has classified is
-- worse than one that reports "1,400 of 2,100 lines are unclassified" -- the
-- first is a number to act on, the second is a job to finish.
--
-- ONE FUNCTION, FIVE BREAKDOWNS, ONE ROUND TRIP. They share a filter and a
-- date window; five separate queries would be five chances for the screen to
-- show a total that does not match the rows under it.
--
-- SECURITY INVOKER (the default, and left that way deliberately): it reads
-- `spare_consumption` and `calls`, both behind RLS, so a reader sees the
-- consumption their role allows and no more. A definer here would quietly show
-- an engineer the whole company's figures.
-- ===========================================================================

-- ---- the category, as data -------------------------------------------------
alter table public.parts add column if not exists category text not null default '';

-- THE CHECK CONSTRAINT THAT USED TO BE HERE IS GONE, AND ITS ABSENCE IS THE
-- POINT. It read `check (category in ('', 'Consumable', 'Spare', 'Product',
-- 'Labour'))`, and 0152 DROPS it four files later for a reason argued out in
-- that file: a check on this column aborts a bulk import PART-WRITTEN the day
-- the Item Master gains a fifth word.
--
-- Leaving the `add` here was still wrong, because a bundle is RE-RUN WHOLE.
-- Its guard was `if not exists (... conname = 'parts_category_check')` — and
-- after 0152 the constraint's ABSENCE IS THE CORRECT STATE, so every re-run
-- saw it missing and tried to put it back. On an empty database that succeeds
-- and 0152 removes it again, which is why every check here passed. On the live
-- project, where a part had since been loaded with a category outside those
-- five words, it failed (reported 2026-09-20):
--
--   ERROR: 23514: check constraint "parts_category_check" of relation "parts"
--   is violated by some row
--
-- and the bundle stopped there — BEFORE reaching 0152, which would have
-- dropped it. `IF NOT EXISTS` guards a NAME, never an INTENTION.
--
-- Removing it changes no end state: 0152 still drops the constraint
-- defensively for any project that ran an older copy of this file, and
-- `_status.sql` row 115 asserts it is absent.

comment on column public.parts.category is
  'Consumable | Spare | Product | Labour | '''' (unclassified) -- the Item Master''s own vocabulary. Set on Part Master or loaded from that file. Empty means nobody has said yet, and Spare Insights reports it as Unclassified rather than folding it into either bucket.';

create index if not exists parts_category_idx on public.parts (category) where category <> '';

-- ---------------------------------------------------------------------------
-- THE INSIGHT. One call, one date window, five answers.
--
-- Consumption stores the part as "CODE|Description"; the part master stores the
-- code bare. So the join is on the CODE, upper-cased and trimmed -- the same
-- rule the Not Consumed report uses, and for the same reason: the description
-- drifts and the code does not.
--
-- DATED BY `created_at`, which is when the consumption was BOOKED. The visit it
-- belongs to has its own date, and the two disagree; booking is the event this
-- report is about ("consumption date"), and it is the one that cannot be
-- back-dated by hand.
-- ---------------------------------------------------------------------------
drop function if exists public.spare_insights(date, date);
create function public.spare_insights(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = public
as $$
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
  where sc.created_at >= p_from::timestamptz
    and sc.created_at <  (p_to + 1)::timestamptz     -- inclusive of p_to
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
  select to_char(date_trunc('month', sc.created_at), 'YYYY-MM') as month,
         sum(coalesce(sc.qty, 0)) as qty
    from public.spare_consumption sc
   where sc.created_at >= p_from::timestamptz
     and sc.created_at <  (p_to + 1)::timestamptz
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
$$;

grant execute on function public.spare_insights(date, date) to authenticated;

comment on function public.spare_insights(date, date) is
  'Spare consumption over a date window, five ways: the biggest consumers, the cover (item status) they were fitted under, the products they went into, the consumable/spare split, and the shape by month. SECURITY INVOKER, so a reader sees only the consumption their role allows. Dated by when the consumption was BOOKED (created_at). Voided lines (qty 0) are excluded: a corrected entry is not consumption.';
