-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12): why Spare Insights times out, part 2.
-- The query alone runs in 0.37 s as the signed-in admin. This times (1) the
-- FUNCTION itself and (2) the query planned GENERICALLY -- without knowing the
-- dates, which is how a SQL-language function plans it.
-- ===========================================================================
begin;
select set_config('request.jwt.claims',
         (select json_build_object('sub', p.id::text, 'role', 'authenticated', 'email', p.email)::text
            from public.profiles p where p.role = 'admin' and p.full_name ilike 'Rithi Admin%' limit 1), true) is not null as admin_found;
set local role authenticated;
set local statement_timeout = '120s';
explain (analyze, timing) select public.spare_insights(date '2026-01-01', date '2026-10-12');
set local plan_cache_mode = force_generic_plan;
prepare si_generic(date, date) as
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
);
explain (analyze, buffers, timing) execute si_generic(date '2026-01-01', date '2026-10-12');
commit;
