-- ===========================================================================
-- 0393  FAILURE RATE FROM THE DCCR, BY COMMISSIONING MONTH (2026-10-06).
--
-- The user: "There is a Rule for Calculation - Failure within 3 Months,
-- Rolling average for 12 Months, But this is run on a Filtered Data - Filters
-- -> Spare / Consumable / Correction / Calibration = Spare ; From DCCR ...
-- Probably add a Separate Tab to do this Calculation and then from there map
-- the 12 Months rolling average to Objective." Their WRR workbook, mimicked:
--
--   * A FAILURE is a Field call whose DCCR (call_reviews) Spare / Consumable /
--     Correction / Calibration contains SPARE, OR whose Any Potential Effect is
--     YES -- the QUERY's own `Col13 contains 'SPARE' or Col12 = 'YES'`, which
--     the user chose over SPARE alone. Cancelled calls and calls with no serial
--     are out. EVERY CALL counts, as the sheet's COUNTIFS does, so a rate can
--     pass 100% (the sheet's 125% / 150%). No "Add?" field: every call counts.
--   * Its MACHINE is the Product Database row of that serial and product
--     installed (Warranty Start) on or before the call -- the latest such --
--     and its COMMISSIONING MONTH is that Warranty Start's month. A call with
--     no such machine has no commissioning month and is not counted.
--   * PARC is the machines of the product commissioned in the month.
--   * "Failures before N months" counts the calls within N months of their
--     machine's installation, and is BLANK while the month is younger than N
--     months (the sheet's D >= N); the rate is that over Parc, blank with no
--     Parc.
--   * THE OBJECTIVE is the plain AVERAGE of the 3-month rates of the 12
--     commissioning months ending in the objective's month, blanks left out
--     (the user's choices). 3 and 12 are the existing settings on SLA /
--     Objective Configuration (failure_window_months, failure_rolling_months).
--   * As of the month's end, never later than today: a call registered after
--     it is not yet a failure.
--
-- objective_value is RESTATED FROM THE DATABASE (0359's body) with one branch
-- added, `dccr_failure_cohort`; every other branch is word for word. The six
-- 2026 failure-rate objectives on failure_rate_12m are moved to the new key,
-- their product / serial filters kept; the old key stays selectable.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE FAILING CALLS -- the sheet's "Services" tab, filtered.
-- ---------------------------------------------------------------------------
create or replace function public._dccr_failure_calls(p_product text, p_serial text, p_asof date)
returns table (ucn text, call_number text, reg_date date, product_name text, serial text,
               party_name text, installed_on date, commissioning_month date,
               days_to_failure integer, spare_category text, any_potential_effect text)
language sql stable security definer set search_path = public as $$
  select c.ucn, c.call_number, c.reg_date, c.product_name, c.serial, c.party_name,
         m.warranty_start, date_trunc('month', m.warranty_start)::date,
         (c.reg_date - m.warranty_start)::integer,
         coalesce(r.spare_category, ''), coalesce(r.any_potential_effect, '')
    from public.field_calls c
    join public.call_reviews r on r.ucn = c.ucn
    join lateral (
      select pr.warranty_start
        from public.products pr
       where upper(btrim(coalesce(pr.serial_number, ''))) = upper(btrim(c.serial))
         and pr.item_name ilike p_product
         and pr.warranty_start is not null
         and pr.warranty_start <= c.reg_date
       order by pr.warranty_start desc, pr.id desc
       limit 1) m on true
   where c.cancelled_at is null
     and btrim(coalesce(c.serial, '')) <> ''
     and c.product_name ilike p_product
     and coalesce(c.serial, '') ilike p_serial
     and c.reg_date <= p_asof
     and (upper(coalesce(r.spare_category, '')) like '%SPARE%'
          or upper(btrim(coalesce(r.any_potential_effect, ''))) = 'YES')
$$;
revoke execute on function public._dccr_failure_calls(text, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. ONE ROW PER COMMISSIONING MONTH for one window -- what the Objective
--    averages. Months from the first machine's to the as-of month.
-- ---------------------------------------------------------------------------
create or replace function public._dccr_failure_cohort_rows(p_product text, p_serial text, p_asof date, p_window integer)
returns table (month date, parc integer, failures integer, rate numeric)
language sql stable security definer set search_path = public as $$
  with mach as (
    select date_trunc('month', pr.warranty_start)::date as cm
      from public.products pr
     where pr.item_name ilike p_product
       and coalesce(pr.serial_number, '') ilike p_serial
       and btrim(coalesce(pr.serial_number, '')) <> ''
       and pr.warranty_start is not null
       and pr.warranty_start <= p_asof
  ),
  months as (
    select generate_series((select min(cm) from mach), date_trunc('month', p_asof)::date,
                           interval '1 month')::date as m
  ),
  calls as (select * from public._dccr_failure_calls(p_product, p_serial, p_asof))
  select ms.m,
         (select count(*) from mach where mach.cm = ms.m)::integer,
         case when (ms.m + make_interval(months => p_window))::date <= p_asof then
           (select count(*) from calls k
             where k.commissioning_month = ms.m
               and k.reg_date <= (k.installed_on + make_interval(months => p_window))::date)::integer
         end,
         case when (ms.m + make_interval(months => p_window))::date <= p_asof
                   and (select count(*) from mach where mach.cm = ms.m) > 0 then
           round((select count(*) from calls k
                   where k.commissioning_month = ms.m
                     and k.reg_date <= (k.installed_on + make_interval(months => p_window))::date)::numeric
                 / (select count(*) from mach where mach.cm = ms.m), 6)
         end
    from months ms
$$;
revoke execute on function public._dccr_failure_cohort_rows(text, text, date, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. WHAT THE PAGE READS, behind the Objective page's own gate.
-- ---------------------------------------------------------------------------
create or replace function public.dccr_failure_cohorts(p_objective bigint, p_asof date default null)
returns table (month date, parc integer,
               f3 integer, r3 numeric, f6 integer, r6 numeric, f12 integer, r12 numeric,
               f24 integer, r24 numeric, f36 integer, r36 numeric, f60 integer, r60 numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  o public.quality_objectives;
  d date := least(coalesce(p_asof, (now() at time zone 'Asia/Kolkata')::date),
                  (now() at time zone 'Asia/Kolkata')::date);
  v_prod text; v_serial text;
begin
  if not (public.has_perm('calls.view') or public.has_perm('reports.view')) then
    raise exception 'RBAC: you cannot read the calls behind this figure';
  end if;
  select * into o from public.quality_objectives where id = p_objective;
  if not found or coalesce(o.calc_params->>'product', '') = '' then return; end if;
  v_prod := o.calc_params->>'product';
  v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');
  return query
    select a.month, a.parc, a.failures, a.rate, b.failures, b.rate, c12.failures, c12.rate,
           d24.failures, d24.rate, e36.failures, e36.rate, f60.failures, f60.rate
      from public._dccr_failure_cohort_rows(v_prod, v_serial, d, 3) a
      join public._dccr_failure_cohort_rows(v_prod, v_serial, d, 6) b using (month)
      join public._dccr_failure_cohort_rows(v_prod, v_serial, d, 12) c12 using (month)
      join public._dccr_failure_cohort_rows(v_prod, v_serial, d, 24) d24 using (month)
      join public._dccr_failure_cohort_rows(v_prod, v_serial, d, 36) e36 using (month)
      join public._dccr_failure_cohort_rows(v_prod, v_serial, d, 60) f60 using (month)
     order by a.month;
end $$;
revoke execute on function public.dccr_failure_cohorts(bigint, date) from public, anon;
grant execute on function public.dccr_failure_cohorts(bigint, date) to authenticated;

create or replace function public.dccr_failure_calls(p_objective bigint, p_asof date default null)
returns table (ucn text, call_number text, reg_date date, product_name text, serial text,
               party_name text, installed_on date, commissioning_month date,
               days_to_failure integer, spare_category text, any_potential_effect text)
language plpgsql stable security definer set search_path = public as $$
declare
  o public.quality_objectives;
  d date := least(coalesce(p_asof, (now() at time zone 'Asia/Kolkata')::date),
                  (now() at time zone 'Asia/Kolkata')::date);
begin
  if not (public.has_perm('calls.view') or public.has_perm('reports.view')) then
    raise exception 'RBAC: you cannot read the calls behind this figure';
  end if;
  select * into o from public.quality_objectives where id = p_objective;
  if not found or coalesce(o.calc_params->>'product', '') = '' then return; end if;
  return query
    select * from public._dccr_failure_calls(o.calc_params->>'product',
             coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%'), d) k
     order by k.reg_date desc, k.ucn;
end $$;
revoke execute on function public.dccr_failure_calls(bigint, date) from public, anon;
grant execute on function public.dccr_failure_calls(bigint, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. objective_value, restated with the new branch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.objective_value(p_id bigint, p_month integer)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o        public.quality_objectives;
  p        record;
  v_serial text;
  v_prod   text;
  v_days   integer;
  n_num    integer;
  n_den    integer;
  v_from   date;     -- the first day of the rolling window
  v_upto   date;     -- the cut-off
  v_win    integer;  -- months after installation a call is a failure
  v_avg    numeric;  -- the DCCR cohort average (0393)
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found or o.calc_key = '' then return null; end if;

  select * into p from public.objective_period(p_id, p_month);
  if not found or not p.applies then return null; end if;

  -- FAILURE WITHIN <window> MONTHS OF INSTALLATION, over the machines installed
  -- in the rolling <rolling> months to the cut-off (0357). Installation is the
  -- WARRANTY START. Counted in MACHINES, so a machine called out three times
  -- inside its window is one failure.
  -- ONE HASHED JOIN, NOT A SEARCH PER MACHINE (0359). The machines installed
  -- in the window are joined to the calls of the window on the serial; the
  -- settings are read once into variables, and the calls are bounded below by
  -- the window's first day -- a qualifying call is on or after a warranty
  -- start that is itself inside the window, so the bound removes nothing that
  -- could count. Same rule, same answer as 0357.
  if o.calc_key = 'failure_rate_12m' then
    v_prod   := o.calc_params->>'product';
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');
    v_upto   := p.period_end;
    v_from   := (v_upto - make_interval(months => public.objective_setting('failure_rolling_months', 12)))::date;
    v_win    := public.objective_setting('failure_window_months', 3);
    -- EXECUTE, as the other branches here do: a plpgsql query is re-planned
    -- GENERICALLY after its fifth run in a session, and Re-Calculate runs this
    -- one sixty times in one statement. The generic plan was ten times slower
    -- (1.5 s for ten months against 0.16 s); a dynamic query is planned with
    -- its values every time.
    execute $q$
    with base as (
      select pr.id, upper(btrim(pr.serial_number)) as k, pr.warranty_start as ws
        from public.products pr
       where pr.item_name ilike $1
         and coalesce(pr.serial_number, '') ilike $2
         and btrim(coalesce(pr.serial_number, '')) <> ''
         and pr.warranty_start > $3
         and pr.warranty_start <= $4
    ),
    failed as (
      select distinct b.id
        from base b
        join public.field_calls c on upper(btrim(coalesce(c.serial, ''))) = b.k
       where c.cancelled_at is null
         and c.product_name ilike $1
         and c.reg_date > $3
         and c.reg_date <= $4
         and c.reg_date >= b.ws
         and c.reg_date <= (b.ws + make_interval(months => $5))::date
    )
    select (select count(*) from base), (select count(*) from failed)
    $q$ into n_den, n_num using v_prod, v_serial, v_from, v_upto, v_win;
    if coalesce(n_den, 0) = 0 then return null; end if;   -- nothing installed, no rate
    return round(n_num::numeric / n_den, 6);
  end if;

  -- DCCR FAILURE BY COMMISSIONING MONTH (0393, the user 2026-10-06). The
  -- average of the <window>-month failure rates of the <rolling> commissioning
  -- months ending in this month; a month still inside its window, or with no
  -- machine installed, is blank and left out of the average -- the sheet's
  -- AVERAGE over its blank cells. dccr_failure_cohort_rows() is the table the
  -- Objective page's Failure Rate tab shows, so the two cannot disagree.
  if o.calc_key = 'dccr_failure_cohort' then
    v_upto := least(p.period_end, (now() at time zone 'Asia/Kolkata')::date);
    v_win  := public.objective_setting('failure_window_months', 3);
    select avg(cr.rate)
      into v_avg
      from public._dccr_failure_cohort_rows(
             o.calc_params->>'product',
             coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%'),
             v_upto, v_win) cr
     where cr.month >= (date_trunc('month', v_upto)
                        - make_interval(months => public.objective_setting('failure_rolling_months', 12) - 1))::date
       and cr.month <= date_trunc('month', v_upto)::date
       and cr.rate is not null;
    return case when v_avg is null then null else round(v_avg, 6) end;
  end if;

  if o.calc_key = 'open_rate_monthly' then
    -- THE VISIT DATE decides, not the entry date. A solving report with no
    -- visit date recorded falls back to when it was entered, so a missing
    -- keystroke cannot push a closed call back into the open column.
    execute format($q$
      select count(*),
             count(*) filter (where not exists (
               select 1 from public.reports r
                where r.ucn = c.ucn and r.call_status ilike 'solved%%'
                  and coalesce(r.visit_at::date, r.updated_at::date) <= $4))
        from %s c
       where c.cancelled_at is null
         and c.call_type ilike $3
         and c.reg_date >= $1 and c.reg_date <= $2
    $q$, public.objective_call_table(o.calc_params))
      into n_den, n_num
     using p.period_start, p.period_end,
           coalesce(nullif(btrim(o.calc_params->>'call_type'), ''), '%'),
           p.solve_cutoff;
    if coalesce(n_den, 0) = 0 then return null; end if;   -- no calls, no rate
    return round(n_num::numeric / n_den, 6);
  end if;

  if o.calc_key = 'attended_within_days' then
    v_days := coalesce((o.calc_params->>'days')::integer, 3);
    execute format($q$
      with c as (
        select cc.ucn,
               greatest(cc.complaint_date, coalesce(cc.reg_at::date, cc.reg_date)) as counts_from
          from %s cc
         where cc.cancelled_at is null
           and cc.call_type ilike $3
           and cc.reg_date >= $1 and cc.reg_date <= $2
      ),
      fv as (select ucn, min(visit_at)::date as on_date from public.reports
              where visit_at is not null group by ucn),
      fs as (select ucn, min(coalesce(or_req_date, created_at::date)) as on_date
               from public.spare_requests
              where coalesce(btrim(ucn), '') <> '' group by ucn)
      select count(*),
             count(*) filter (
               where least(fv.on_date, fs.on_date) is not null
                 and c.counts_from is not null
                 and greatest((least(fv.on_date, fs.on_date) - c.counts_from)::int, 0) <= $4)
        from c left join fv on fv.ucn = c.ucn left join fs on fs.ucn = c.ucn
    $q$, public.objective_call_table(o.calc_params))
      into n_den, n_num
     using p.period_start, p.period_end,
           coalesce(nullif(btrim(o.calc_params->>'call_type'), ''), '%'), v_days;
    if coalesce(n_den, 0) = 0 then return null; end if;   -- no calls, no rate
    return round(n_num::numeric / n_den, 6);
  end if;

  -- -------------------------------------------------------------------------
  -- ffr_count_monthly -- HOW MANY FIELD FAILURE REPORTS WERE RAISED.
  --
  -- A COUNT, not a rate, and the first objective here that is one. Three things
  -- follow from that and none of them is incidental:
  --
  --   * it counts DISTINCT FFR NUMBERS, not rows. 0181 made the register one
  --     row per MACHINE precisely because one report can cover several -- eight
  --     FFR numbers over twelve machines, measured -- so counting rows would
  --     report twelve failures where four reports exist. A report with no
  --     number counts as itself (`row-<id>`) rather than collapsing with every
  --     other unnumbered one.
  --   * ZERO IS AN ANSWER. Every rate above returns null on an empty
  --     denominator because a rate over nothing is undefined; a count over
  --     nothing is nought, and that is the whole point of an objective whose
  --     target is "To Monitor". A blank would read as "not measured yet",
  --     which is a different and worse claim.
  --   * the month is the FFR DATE and there is no fallback, because none is
  --     reachable: 0165 declares `ffr_date date not null default (now() at time
  --     zone 'Asia/Kolkata')::date`. The first draft here carried a
  --     coalesce to created_at and a note explaining it -- dead code, and a
  --     note describing a rule that can never fire is worse than no note in a
  --     record somebody signs. The test found it by inserting a null.
  -- -------------------------------------------------------------------------
  if o.calc_key = 'ffr_count_monthly' then
    v_prod   := coalesce(nullif(btrim(o.calc_params->>'product'), ''), '%');
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');
    select count(distinct coalesce(nullif(btrim(f.ffr_no), ''), 'row-' || f.id))
      into n_num
      from public.field_failure_reports f
     where coalesce(f.product_name, '') ilike v_prod
       and coalesce(f.product_serial, '') ilike v_serial
       and f.ffr_date >= p.period_start
       and f.ffr_date <= p.period_end;
    return coalesce(n_num, 0);
  end if;

  return null;
end $function$;

-- ---------------------------------------------------------------------------
-- 5. The six failure-rate objectives move to the DCCR rule.
-- ---------------------------------------------------------------------------
update public.quality_objectives
   set calc_key = 'dccr_failure_cohort'
 where year = 2026 and calc_key = 'failure_rate_12m';
