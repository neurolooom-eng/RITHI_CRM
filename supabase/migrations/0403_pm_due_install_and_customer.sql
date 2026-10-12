-- ===========================================================================
-- 0403 — PM DUE: TWO MORE RULES, EACH ALSO A FILTER (the user, 2026-10-08:
-- "Add 2 more logics - But add these as rules + Filters").
--
--   1. "The installation call associated with it should be in solved state" --
--      the machine's call in the Installation register (product + serial, the
--      match 0331's warranty start already uses) reads open_state = 'Solved'.
--      A Solved call is taken over a cancelled or later one, so a cancelled
--      first attempt does not hide the solved second. No installation call
--      fails the rule.
--   2. "Party the device is associated to should be a customer" -- the
--      machine's party (the Product Database's, which follows transfers; else
--      the register's) has Type CUSTOMER on the Party Master. DEALER is a
--      dealer (0328); a party not in the master, or with no Type, fails.
--
-- Every row is still listed, with its installation call, its state, its
-- party's Type and the two answers, so the screen can filter by each; a row
-- may be CREATED (`can_create`) only when it is a Missed PM passing both.
--
-- Same name, more columns: `create or replace` cannot change result columns,
-- so the function is dropped and recreated (0402 now drops it first too, so
-- re-running that bundle does not fail on this one). Definer with its own
-- pm.generate check and not executable by anon, as 0402.
-- ===========================================================================

drop function if exists public.pm_visits_due(date);

create or replace function public.pm_visits_due(p_month date)
returns table (
  source           text,     -- 'Warranty' or 'Contract'
  ref_no           text,     -- the SA number or the MC number
  product_name     text,
  serial           text,
  is_accessory     boolean,  -- Product Master category ACCESSORY
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
  generated        boolean,  -- a PM call "k / N" exists for this visit, not cancelled
  generated_ucn    text,
  generated_on     date,     -- that call's registration date
  last_pm_on       date,     -- the machine's latest PM call, any visit
  installation_ucn   text,   -- the machine's installation call (product + serial)
  installation_state text,   -- its state: Solved, Unsolved, ... ; NULL = none
  install_solved     boolean,-- RULE 1: that call reads Solved
  party_type         text,   -- the Party Master's Type for the machine's party; NULL = not in it
  party_is_customer  boolean,-- RULE 2: that Type is CUSTOMER
  can_create         boolean -- a Missed PM passing both rules
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
  ), one as (
    -- One row per machine, the warranty's visit first (0218's order).
    select distinct on (vi.mk) vi.*
      from visits vi
     order by vi.mk, (vi.src = 'Warranty') desc, vi.cs desc
  ), pm as materialized (
    -- The PM register read ONCE and hash-joined, with the "k / N" of its
    -- Reported Problem parsed. Only machines in this month's list.
    select lower(btrim(coalesce(pc.product_name, ''))) || '|' || lower(btrim(coalesce(pc.serial, ''))) as mk,
           pc.ucn, pc.reg_date,
           (regexp_match(coalesce(pc.complaint_reported, ''), '(\d+)\s*/\s*(\d+)'))::int[] as kn
      from public.pm_calls pc
     where pc.cancelled_at is null
       and lower(btrim(coalesce(pc.product_name, ''))) || '|' || lower(btrim(coalesce(pc.serial, '')))
           in (select o.mk from one o)
  ), gen as (
    select distinct on (o.mk) o.mk, pm.ucn, pm.reg_date
      from one o
      join pm on pm.mk = o.mk
             and pm.kn[1] = o.kk and pm.kn[2] = o.v
             and pm.reg_date between date_trunc('month', o.cs)::date and o.ce
     order by o.mk, pm.reg_date desc, pm.ucn desc
  ), last_pm as (
    select pm.mk, max(pm.reg_date) as d from pm group by pm.mk
  ), inst as (
    -- RULE 1. The machine's installation call: a Solved one if it has one,
    -- else the latest not cancelled, else the latest -- so a cancelled first
    -- attempt does not hide the solved second one.
    select distinct on (lower(btrim(coalesce(ic.product_name, ''))) || '|' || lower(btrim(coalesce(ic.serial, ''))))
           lower(btrim(coalesce(ic.product_name, ''))) || '|' || lower(btrim(coalesce(ic.serial, ''))) as mk,
           ic.ucn, ic.open_state
      from public.installation_calls ic
     where lower(btrim(coalesce(ic.product_name, ''))) || '|' || lower(btrim(coalesce(ic.serial, '')))
           in (select o.mk from one o)
     order by lower(btrim(coalesce(ic.product_name, ''))) || '|' || lower(btrim(coalesce(ic.serial, ''))),
              (ic.open_state = 'Solved') desc, (ic.cancelled_at is null) desc,
              ic.reg_date desc nulls last, ic.ucn desc
  ), acc as (
    select distinct lower(btrim(pmx.product_name)) as p
      from public.product_master pmx
     where upper(btrim(coalesce(pmx.item_category, ''))) = 'ACCESSORY'
  )
  , rowz as (
    select o.src, o.ref, o.p, o.s,
           lower(o.p) in (select acc.p from acc) as is_acc,
           coalesce(nullif(btrim(pr.party_name), ''), o.party) as party,
           coalesce(nullif(btrim(pr.city), ''), o.cty) as cty,
           coalesce(nullif(btrim(pr.state), ''), o.st) as st,
           nullif(btrim(coalesce(pr.service_engineer, '')), '') as eng,
           pr.id is not null as on_pd,
           o.ctype, o.cs, o.ce, o.m, o.v, o.kk, o.due,
           g.ucn is not null as gen, g.ucn as gucn, g.reg_date as gon, lp.d as lpd,
           i.ucn as iucn, i.open_state as istate
      from one o
      left join gen g on g.mk = o.mk
      left join last_pm lp on lp.mk = o.mk
      left join inst i on i.mk = o.mk
      left join lateral (
        select * from public.products x
         where x.machine_key = o.mk
         order by x.id desc limit 1) pr on true
  )
  -- RULE 2. The party the machine is with -- the Product Database's, else the
  -- register's -- is a CUSTOMER on the Party Master (its Type; DEALER is a
  -- dealer, 0328). A party not in the master, or with no Type, is not shown as
  -- a customer: the rule asks for one, and a blank says nothing.
  select r.src, r.ref, r.p, r.s, r.is_acc, r.party, r.cty, r.st, r.eng, r.on_pd,
         r.ctype, r.cs, r.ce, r.m, r.v, r.kk, r.due, r.gen, r.gucn, r.gon, r.lpd,
         r.iucn, r.istate, coalesce(r.istate = 'Solved', false),
         pt.party_type,
         coalesce(upper(btrim(pt.party_type)) = 'CUSTOMER', false),
         not r.gen and coalesce(r.istate = 'Solved', false) and coalesce(upper(btrim(pt.party_type)) = 'CUSTOMER', false)
    from rowz r
    left join public.parties pt on pt.name_key = lower(btrim(r.party))
   order by r.party nulls last, r.p, r.s;
end $$;

comment on function public.pm_visits_due(date) is
  'The machines with a PM visit due in a month from the Warranty and Contract Registers (visit k on start + k x months x 30 / visits days), each GENERATED when a PM call "k / N" exists for it in the cover period and is not cancelled, else MISSED PM; accessories marked; its installation call and whether it is Solved; its party''s Party Master Type and whether it is CUSTOMER; can_create when a Missed PM passes both. Needs pm.generate (0403).';

revoke execute on function public.pm_visits_due(date) from public, anon;
grant execute on function public.pm_visits_due(date) to authenticated;
