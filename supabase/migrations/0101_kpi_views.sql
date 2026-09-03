-- ===========================================================================
-- KPIs THAT COME FROM THE RECORD, NOT FROM A SPREADSHEET.
--
-- Three questions the service function actually asks, each answered by an
-- aggregate the database computes rather than a page that pulls forty thousand
-- rows across the wire and adds them up in a browser:
--
--   FAILURE RATE      how often does a product fail, per machine in the field?
--                     A count of calls means nothing on its own — a product with
--                     1,200 machines SHOULD generate more calls than one with 40.
--                     The denominator is the install base, which the Product
--                     Register already holds.
--
--   SPARE USE BY COVER  what do we spend on parts under warranty, under CMC,
--                     under AMC, and out of guarantee? The cover is on the CALL,
--                     the parts are on the consumption; the join is the answer.
--
--   SPARE USE BY REGION  the same figure per region, so a region consuming twice
--                     its share can be looked at rather than guessed at.
--
-- EVERY VIEW IS security_invoker, so an engineer's KPIs are their own calls and
-- a manager's are their team's. The numbers a person sees are the numbers they
-- are allowed to see, without a second set of rules to keep in step.
--
-- `create or replace view` does NOT carry security_invoker over — it is asserted
-- on every one of them, every time.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One row per part consumed, carrying what the call says about it. This is the
-- grain everything else rolls up from; it is also worth reading on its own when
-- a number looks wrong.
--
-- The cover (`item_status`) and the region are FACTS ABOUT THE CALL AND THE
-- ENGINEER, not about the part, so they are read from there rather than copied
-- onto the consumption row where they would age.
-- ---------------------------------------------------------------------------
create or replace view public.spare_usage as
  select c.id,
         c.ucn,
         c.call_number,
         c.part,
         public.part_code(c.part)                            as part_code,
         coalesce(c.qty, 0)                                  as qty,
         coalesce(nullif(btrim(c.engineer), ''), '')         as engineer,
         coalesce(nullif(btrim(k.item_status), ''), 'Not stated') as cover,
         coalesce(nullif(btrim(k.product_name), ''), '')     as product,
         coalesce(nullif(btrim(k.call_type), ''), '')        as call_type,
         coalesce(nullif(btrim(k.city), ''), '')             as city,
         coalesce(nullif(btrim(ud.region), ''), 'No region') as region,
         coalesce(nullif(btrim(c.source), ''), 'Engineer')   as source,
         c.created_at                                        as consumed_at
    from public.spare_consumption c
    left join public.calls k on k.ucn = c.ucn
    left join public.user_directory ud
           on lower(btrim(ud.name)) = lower(btrim(coalesce(nullif(c.engineer, ''), k.allocated_to)))
   where coalesce(c.qty, 0) <> 0;
alter view public.spare_usage set (security_invoker = on);
grant select on public.spare_usage to authenticated;

-- ---------------------------------------------------------------------------
-- Spare use by cover, region and product, in one rollup the screen pivots.
--
-- One row per combination rather than three separate views: a few thousand rows
-- at most, and a client that has them can answer "CMC in the South" without
-- another round trip — and, more to the point, without the three views being
-- able to disagree with each other.
-- ---------------------------------------------------------------------------
create or replace view public.spare_usage_rollup as
  select cover, region, product,
         count(*)::int                     as lines,
         sum(qty)                          as qty,
         count(distinct ucn)::int          as calls,
         count(distinct part_code)::int    as parts,
         count(distinct engineer)::int     as engineers
    from public.spare_usage
   group by cover, region, product;
alter view public.spare_usage_rollup set (security_invoker = on);
grant select on public.spare_usage_rollup to authenticated;

-- ---------------------------------------------------------------------------
-- FAILURE RATE — calls per hundred machines in the field, over twelve months.
--
-- `machines` is the install base from the Product Register and is NOT scoped by
-- who is asking: it is a property of the fleet, the same number for everybody.
-- `calls_12m` is scoped, because it is a count of calls. So an engineer reads
-- their own share of a fleet-wide denominator, which is the honest reading of
-- what they can see, and a rate is only comparable between products for someone
-- who can see all the calls. The screen says so.
--
-- Twelve months because a reliability figure needs a period; the same view
-- carries the all-time count beside it so a young product is not read as a
-- reliable one.
-- ---------------------------------------------------------------------------
create or replace view public.failure_rate_by_product as
  with fleet as (
    select coalesce(nullif(btrim(item_name), ''), '') as product, count(*)::int as machines
      from public.products
     where coalesce(btrim(item_name), '') <> ''
     group by 1
  ), calls as (
    select coalesce(nullif(btrim(product_name), ''), '') as product,
           count(*)::int as calls_total,
           count(*) filter (where reg_date >= (current_date - 365))::int as calls_12m,
           count(*) filter (where open_state <> 'Solved')::int as calls_open
      from public.calls
     where coalesce(btrim(product_name), '') <> ''
     group by 1
  )
  select coalesce(f.product, c.product)      as product,
         coalesce(f.machines, 0)             as machines,
         coalesce(c.calls_total, 0)          as calls_total,
         coalesce(c.calls_12m, 0)            as calls_12m,
         coalesce(c.calls_open, 0)           as calls_open,
         case when coalesce(f.machines, 0) > 0
              then round(coalesce(c.calls_12m, 0)::numeric * 100 / f.machines, 1)
         end                                  as per_100_machines
    from fleet f
    full join calls c on c.product = f.product;
alter view public.failure_rate_by_product set (security_invoker = on);
grant select on public.failure_rate_by_product to authenticated;

-- ---------------------------------------------------------------------------
-- HOW a product fails, not just how often. The standard complaint is the field
-- the service desk already chooses from a controlled list, so it is the one
-- thing in the record that groups reliably across thousands of calls.
-- ---------------------------------------------------------------------------
create or replace view public.failure_modes_by_product as
  select coalesce(nullif(btrim(product_name), ''), '')       as product,
         coalesce(nullif(btrim(standard_complaint), ''), 'Not stated') as complaint,
         count(*)::int                                       as calls,
         count(*) filter (where reg_date >= (current_date - 365))::int as calls_12m
    from public.calls
   where coalesce(btrim(product_name), '') <> ''
   group by 1, 2;
alter view public.failure_modes_by_product set (security_invoker = on);
grant select on public.failure_modes_by_product to authenticated;

-- The joins these views make, indexed. `spare_consumption.ucn` is the one that
-- matters: without it every rollup is a hash of the whole consumption history
-- against the whole call register.
create index if not exists spare_consumption_ucn_idx on public.spare_consumption (ucn);
create index if not exists field_calls_product_idx on public.field_calls (product_name);
create index if not exists installation_calls_product_idx on public.installation_calls (product_name);
create index if not exists pm_calls_product_idx on public.pm_calls (product_name);
