-- ===========================================================================
-- 0401 — PM DUE: THE MONTH'S PM VISITS, FROM THE WARRANTY AND CONTRACT
-- REGISTERS (the user, 2026-10-08: "Can we do PM generation from Contract and
-- warranty register?").
--
-- What was asked, answer by answer:
--   * A PM Due screen lists the machines due in a chosen month; the
--     coordinator reviews and creates the PM calls. PM Bulk Upload stays as it
--     is ("don't replace the monthly upload for now").
--   * VISIT k IS DUE ON start + k x (months x 30 / visits) DAYS, rounded to the
--     nearest day, and falls in the month that date falls in. The user's own
--     example: start 10 January, 3 visits in 12 months -> 120 days -> the first
--     visit is due 10 May, so it is a May PM. Never after the cover's end date.
--   * ONLY WHAT REMAINS: a machine is due in the month when the visits
--     scheduled up to that month outnumber the PM calls already raised for it
--     (model + serial, not cancelled) between the cover's start month and the
--     end of that month.
--   * The engineer is the Product Database's Service Engineer for the machine.
--
-- ONE ROW PER MACHINE. A machine whose warranty and contract both have a visit
-- in the month is listed once, from the WARRANTY -- the order Product
-- Database 2.0 already decides cover in (0218).
--
-- The party, city and state are the Product Database's -- the machine's
-- CURRENT owner after any transfer (0238) -- and the register's where the
-- machine has no Product Database row.
--
-- SECURITY DEFINER, WITH ITS OWN CHECK: counting the PM calls already raised
-- must see ALL of them, or a reader whose row-level security hides some would
-- be told a visit is still owed and raise it twice. So it runs as the owner,
-- refuses anybody without pm.generate, and is not executable by the public key.
-- `pm_due_latest_reg_at` is the same rule for the batch's registration time:
-- the LARGEST registration date-and-time in the month, whoever's call it is.
--
-- KEYS: mod:/pm-due opens the page (admin + technical_support only, the 0241
-- pattern); pm.generate reads the list, granted to NO role -- an administrator
-- passes has_perm() anyway. Creating the calls still passes pm_calls' own
-- insert policy (pm.create), exactly as PM Bulk Upload does.
-- ===========================================================================

create or replace function public.pm_due(p_month date)
returns table (
  source           text,     -- 'Warranty' or 'Contract'
  ref_no           text,     -- the SA number or the MC number
  product_name     text,
  serial           text,
  party_name       text,
  city             text,
  state            text,
  engineer         text,     -- the Product Database's Service Engineer
  on_product_database boolean,
  cover_type       text,     -- WGP, or the contract's type as keyed
  cover_start      date,
  cover_end        date,
  period_months    integer,
  pm_visits        integer,
  visit_no         integer,  -- the visit due this month, k of pm_visits
  due_date         date,
  raised           integer   -- PM calls already raised in the period up to this month
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not coalesce(public.has_perm('pm.generate'), false) then
    raise exception 'Listing the PM visits due needs “Generate PM calls from the registers” (pm.generate) on Roles & Permissions.'
      using errcode = '42501';
  end if;

  return query
  with cover as materialized (
    select 'Warranty'::text as src, w.sa_number as ref, btrim(w.product_name) as p, btrim(w.serial_number) as s,
           lower(btrim(w.product_name)) || '|' || lower(btrim(w.serial_number)) as mk,
           w.party_name as party, w.city as cty, w.state as st, 'WGP'::text as ctype,
           w.warranty_start as cs,
           coalesce(w.warranty_end, (w.warranty_start + make_interval(months => w.warranty_months))::date - 1) as ce,
           w.warranty_months as m, w.pm_visits as v
      from public.warranty_sale_details w
     where w.warranty_start is not null and coalesce(w.warranty_months, 0) > 0 and coalesce(w.pm_visits, 0) > 0
       and btrim(coalesce(w.product_name, '')) <> '' and btrim(coalesce(w.serial_number, '')) <> ''
       and w.warranty_start <= m_end
    union all
    select 'Contract', c.mc_number, btrim(c.product_name), btrim(c.serial_number),
           lower(btrim(c.product_name)) || '|' || lower(btrim(c.serial_number)),
           c.party_name, null::text, null::text, coalesce(c.contract_type, ''),
           c.contract_start,
           coalesce(c.contract_end, (c.contract_start + make_interval(months => c.contract_months))::date - 1),
           c.contract_months, c.pm_visits_total
      from public.contract_details c
     where c.contract_start is not null and coalesce(c.contract_months, 0) > 0 and coalesce(c.pm_visits_total, 0) > 0
       and btrim(coalesce(c.product_name, '')) <> '' and btrim(coalesce(c.serial_number, '')) <> ''
       and c.contract_start <= m_end
  ), visits as (
    -- Every visit of every cover, dated by the rule; keep the LAST one that
    -- falls in the month (two can, when the interval is under 30 days).
    select distinct on (cv.src, cv.ref, cv.mk)
           cv.*, k as kk,
           least(cv.cs + round(k * cv.m * 30.0 / cv.v)::int, cv.ce) as due
      from cover cv
      cross join lateral generate_series(1, cv.v) k
     where least(cv.cs + round(k * cv.m * 30.0 / cv.v)::int, cv.ce) between m_start and m_end
     order by cv.src, cv.ref, cv.mk, k desc
  ), pm as materialized (
    -- The PM register read ONCE and hash-joined: a count per machine as a
    -- correlated subquery scanned it once per machine due, and a month owes
    -- over a thousand.
    select lower(btrim(coalesce(pc.product_name, ''))) || '|' || lower(btrim(coalesce(pc.serial, ''))) as mk,
           pc.reg_date
      from public.pm_calls pc
     where pc.cancelled_at is null and pc.reg_date <= m_end
  ), cnt as (
    select vi.src, vi.ref, vi.mk, count(*)::int as n
      from visits vi
      join pm on pm.mk = vi.mk
             and pm.reg_date between date_trunc('month', vi.cs)::date and least(m_end, vi.ce)
     group by 1, 2, 3
  ), counted as (
    select vi.*, coalesce(cnt.n, 0) as n_raised
      from visits vi
      left join cnt on cnt.src = vi.src and cnt.ref = vi.ref and cnt.mk = vi.mk
  ), owed as (
    select distinct on (co.mk) co.*
      from counted co
     where co.kk > co.n_raised
     order by co.mk, (co.src = 'Warranty') desc, co.cs desc
  )
  select o.src, o.ref, o.p, o.s,
         coalesce(nullif(btrim(pr.party_name), ''), o.party),
         coalesce(nullif(btrim(pr.city), ''), o.cty),
         coalesce(nullif(btrim(pr.state), ''), o.st),
         nullif(btrim(coalesce(pr.service_engineer, '')), ''),
         pr.id is not null,
         o.ctype, o.cs, o.ce, o.m, o.v, o.kk, o.due, o.n_raised
    from owed o
    left join lateral (
      select * from public.products x
       where x.machine_key = o.mk
       order by x.id desc limit 1) pr on true
   order by 6 nulls last, 5, 3, 4;
end $$;

comment on function public.pm_due(date) is
  'The PM visits due in a month from the Warranty and Contract Registers: visit k on start + k x months x 30 / visits days, only where the visits scheduled so far outnumber the PM calls raised in the period. One row per machine, warranty first. Needs pm.generate (0401).';

create or replace function public.pm_due_latest_reg_at(p_month date)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.has_perm('pm.generate'), false) then
    raise exception 'Needs “Generate PM calls from the registers” (pm.generate) on Roles & Permissions.'
      using errcode = '42501';
  end if;
  return (select max(pc.reg_at) from public.pm_calls pc
           where pc.reg_date >= date_trunc('month', p_month)::date
             and pc.reg_date < (date_trunc('month', p_month) + interval '1 month')::date);
end $$;

comment on function public.pm_due_latest_reg_at(date) is
  'The largest registration date-and-time among ALL PM calls of a month, so a generated batch starts 10 seconds after it. Needs pm.generate (0401).';

revoke execute on function public.pm_due(date) from public, anon;
revoke execute on function public.pm_due_latest_reg_at(date) from public, anon;
grant execute on function public.pm_due(date) to authenticated;
grant execute on function public.pm_due_latest_reg_at(date) to authenticated;

-- THE SCREEN'S KEY, IN THE ADMIN AND TECHNICAL SUPPORT ROLES ONLY (0241, 0377).
do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select unnest(array['mod:/pm-due']) as v) u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/pm-due');
  get diagnostics n = row_count;
  raise notice '0401: PM Due screen key given to admin + technical_support (% of 2 rows) -- grant the rest on Roles & Permissions', n;
end $$;
