-- ===========================================================================
-- 0474 -- KPI & FAILURE ANALYSIS CAN BE FILTERED BY CALL TYPE (the user,
-- 2026-11-13: "in KPI & Failure Analysis - Filter by Field Calls"; asked, a
-- Call Type filter -- All / Field / Installation / PM -- starting on Field,
-- applied to all three sections).
--
-- The four KPI views (0101) read the `calls` view, which unions the three
-- registers and does not say which a call came from. THE REGISTER IS THE
-- TABLE THE CALL WAS READ FROM, never the Call Type text, which is spelt
-- several ways -- the rule the KPI Export's filter follows (0450). So:
--
--   * spare_usage          appends `register`, reading the three call tables
--                          directly in place of `calls` (the same rows: the
--                          view is exactly their union);
--   * spare_usage_rollup   appends `register` and groups by it;
--   * failure_modes_by_product appends `register` and groups by it;
--   * failure_rate_by_product stays ONE ROW PER PRODUCT -- the denominator is
--                          the product's machines, and a row per register
--                          would repeat it -- and appends each register's
--                          three counts; the screen works out the rate per
--                          100 machines for the register chosen. Its existing
--                          columns still answer for all three together.
--
-- Columns are APPENDED (create-or-replace keeps the existing ones in place);
-- security_invoker re-asserted on each, because create-or-replace drops it, so
-- every count stays what the reader may see.
-- ===========================================================================

create or replace view public.spare_usage as
 SELECT c.id,
    c.ucn,
    c.call_number,
    c.part,
    part_code(c.part) AS part_code,
    COALESCE(c.qty, (0)::numeric) AS qty,
    COALESCE(NULLIF(btrim(c.engineer), ''::text), ''::text) AS engineer,
    COALESCE(NULLIF(btrim(k.item_status), ''::text), 'Not stated'::text) AS cover,
    COALESCE(NULLIF(btrim(k.product_name), ''::text), ''::text) AS product,
    COALESCE(NULLIF(btrim(k.call_type), ''::text), ''::text) AS call_type,
    COALESCE(NULLIF(btrim(k.city), ''::text), ''::text) AS city,
    COALESCE(NULLIF(btrim(ud.region), ''::text), 'No region'::text) AS region,
    COALESCE(NULLIF(btrim(c.source), ''::text), 'Engineer'::text) AS source,
    c.created_at AS consumed_at,
    -- appended (0474): the register the call is on; blank where the
    -- consumption names no call any register holds.
    COALESCE(k.register, ''::text) AS register
   FROM spare_consumption c
     LEFT JOIN (
            SELECT ucn, item_status, product_name, call_type, city, allocated_to, 'Field'::text AS register FROM public.field_calls
  UNION ALL SELECT ucn, item_status, product_name, call_type, city, allocated_to, 'Installation'::text FROM public.installation_calls
  UNION ALL SELECT ucn, item_status, product_name, call_type, city, allocated_to, 'PM'::text FROM public.pm_calls
     ) k ON k.ucn = c.ucn
     LEFT JOIN user_directory ud ON lower(btrim(ud.name)) = lower(btrim(COALESCE(NULLIF(c.engineer, ''::text), k.allocated_to)))
  WHERE COALESCE(c.qty, (0)::numeric) <> (0)::numeric;
alter view public.spare_usage set (security_invoker = on);
grant select on public.spare_usage to authenticated;

create or replace view public.spare_usage_rollup as
 SELECT cover,
    region,
    product,
    (count(*))::integer AS lines,
    sum(qty) AS qty,
    (count(DISTINCT ucn))::integer AS calls,
    (count(DISTINCT part_code))::integer AS parts,
    (count(DISTINCT engineer))::integer AS engineers,
    register
   FROM public.spare_usage
  GROUP BY cover, region, product, register;
alter view public.spare_usage_rollup set (security_invoker = on);
grant select on public.spare_usage_rollup to authenticated;

create or replace view public.failure_modes_by_product as
 SELECT COALESCE(NULLIF(btrim(k.product_name), ''::text), ''::text) AS product,
    COALESCE(NULLIF(btrim(k.standard_complaint), ''::text), 'Not stated'::text) AS complaint,
    (count(*))::integer AS calls,
    (count(*) FILTER (WHERE k.reg_date >= (CURRENT_DATE - 365)))::integer AS calls_12m,
    k.register
   FROM (
            SELECT product_name, standard_complaint, reg_date, 'Field'::text AS register FROM public.field_calls
  UNION ALL SELECT product_name, standard_complaint, reg_date, 'Installation'::text FROM public.installation_calls
  UNION ALL SELECT product_name, standard_complaint, reg_date, 'PM'::text FROM public.pm_calls
   ) k
  WHERE COALESCE(btrim(k.product_name), ''::text) <> ''::text
  GROUP BY COALESCE(NULLIF(btrim(k.product_name), ''::text), ''::text),
           COALESCE(NULLIF(btrim(k.standard_complaint), ''::text), 'Not stated'::text), k.register;
alter view public.failure_modes_by_product set (security_invoker = on);
grant select on public.failure_modes_by_product to authenticated;

create or replace view public.failure_rate_by_product as
 WITH fleet AS (
         SELECT COALESCE(NULLIF(btrim(products.item_name), ''::text), ''::text) AS product,
            (count(*))::integer AS machines
           FROM products
          WHERE COALESCE(btrim(products.item_name), ''::text) <> ''::text
          GROUP BY COALESCE(NULLIF(btrim(products.item_name), ''::text), ''::text)
        ), k AS (
            SELECT product_name, reg_date, open_state, 'Field'::text AS register FROM public.field_calls
  UNION ALL SELECT product_name, reg_date, open_state, 'Installation'::text FROM public.installation_calls
  UNION ALL SELECT product_name, reg_date, open_state, 'PM'::text FROM public.pm_calls
        ), calls AS (
         SELECT COALESCE(NULLIF(btrim(k.product_name), ''::text), ''::text) AS product,
            (count(*))::integer AS calls_total,
            (count(*) FILTER (WHERE k.reg_date >= (CURRENT_DATE - 365)))::integer AS calls_12m,
            (count(*) FILTER (WHERE k.open_state <> 'Solved'::text))::integer AS calls_open,
            (count(*) FILTER (WHERE k.register = 'Field'))::integer AS field_total,
            (count(*) FILTER (WHERE k.register = 'Field' AND k.reg_date >= (CURRENT_DATE - 365)))::integer AS field_12m,
            (count(*) FILTER (WHERE k.register = 'Field' AND k.open_state <> 'Solved'::text))::integer AS field_open,
            (count(*) FILTER (WHERE k.register = 'Installation'))::integer AS installation_total,
            (count(*) FILTER (WHERE k.register = 'Installation' AND k.reg_date >= (CURRENT_DATE - 365)))::integer AS installation_12m,
            (count(*) FILTER (WHERE k.register = 'Installation' AND k.open_state <> 'Solved'::text))::integer AS installation_open,
            (count(*) FILTER (WHERE k.register = 'PM'))::integer AS pm_total,
            (count(*) FILTER (WHERE k.register = 'PM' AND k.reg_date >= (CURRENT_DATE - 365)))::integer AS pm_12m,
            (count(*) FILTER (WHERE k.register = 'PM' AND k.open_state <> 'Solved'::text))::integer AS pm_open
           FROM k
          WHERE COALESCE(btrim(k.product_name), ''::text) <> ''::text
          GROUP BY COALESCE(NULLIF(btrim(k.product_name), ''::text), ''::text)
        )
 SELECT COALESCE(f.product, c.product) AS product,
    COALESCE(f.machines, 0) AS machines,
    COALESCE(c.calls_total, 0) AS calls_total,
    COALESCE(c.calls_12m, 0) AS calls_12m,
    COALESCE(c.calls_open, 0) AS calls_open,
        CASE
            WHEN COALESCE(f.machines, 0) > 0 THEN round(((COALESCE(c.calls_12m, 0))::numeric * (100)::numeric) / (f.machines)::numeric, 1)
            ELSE NULL::numeric
        END AS per_100_machines,
    -- appended (0474): each register's counts, so the screen can filter.
    COALESCE(c.field_total, 0) AS field_total,
    COALESCE(c.field_12m, 0) AS field_12m,
    COALESCE(c.field_open, 0) AS field_open,
    COALESCE(c.installation_total, 0) AS installation_total,
    COALESCE(c.installation_12m, 0) AS installation_12m,
    COALESCE(c.installation_open, 0) AS installation_open,
    COALESCE(c.pm_total, 0) AS pm_total,
    COALESCE(c.pm_12m, 0) AS pm_12m,
    COALESCE(c.pm_open, 0) AS pm_open
   FROM fleet f
     FULL JOIN calls c ON c.product = f.product;
alter view public.failure_rate_by_product set (security_invoker = on);
grant select on public.failure_rate_by_product to authenticated;
