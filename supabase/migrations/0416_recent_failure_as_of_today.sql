-- ===========================================================================
-- 0416 -- A RECENT FAILURE RATE IS MEASURED AS OF TODAY (FRS-277; the user,
-- 2026-10-12: "Objective - Recent Failure ... For these Recent Failures dont
-- need a cutoff date"; asked whether that meant measuring every month as of
-- today or only hiding the cut-off: "Measure as of today").
--
-- 0393 measured each month's DCCR failure rate AS AT THAT MONTH'S END: a call
-- registered after it was not yet a failure, so January's figure was frozen
-- with only the failures known on 31 January. Now every month counts the
-- failing calls registered up to TODAY. The month still chooses which twelve
-- commissioning months are averaged -- anchoring that on today too would make
-- every month the same figure.
--
-- The "Solved by" cut-off dates never fed this figure and still do not.
-- Stored figures change when Re-Calculate is run; nothing is rewritten here.
--
-- objective_value() is RESTATED FROM A DATABASE built from every migration;
-- only the dccr_failure_cohort branch changes (the as-of date passed to
-- _dccr_failure_cohort_rows). Every other branch is word for word.
-- ===========================================================================
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
  -- AS OF TODAY, NOT THE MONTH'S END (0416, the user, 2026-10-12: "For these
  -- Recent Failures dont need a cutoff date"; asked, "Measure as of today").
  -- The month still decides WHICH twelve commissioning months are averaged
  -- (v_upto); every failing call registered up to today counts (v_from holds
  -- today here), so a past month's figure grows as late failures come in.
  if o.calc_key = 'dccr_failure_cohort' then
    v_upto := least(p.period_end, (now() at time zone 'Asia/Kolkata')::date);
    v_from := (now() at time zone 'Asia/Kolkata')::date;
    v_win  := public.objective_setting('failure_window_months', 3);
    select avg(cr.rate)
      into v_avg
      from public._dccr_failure_cohort_rows(
             o.calc_params->>'product',
             coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%'),
             v_from, v_win) cr
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
