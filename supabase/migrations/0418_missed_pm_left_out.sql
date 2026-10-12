-- ===========================================================================
-- 0418 -- A MISSED PM IS LEFT OUT OF THE PM OBJECTIVE, WITH A TOGGLE (FRS-121.15;
-- the user, 2026-10-12: "For PM Breakdown, Any call added after that Month -
-- Dont consider that for Calculation - Or say keep a Toggle button to Consider
-- Missed PM or Not." and "There is a Column in PM Calls - Added On Date ...
-- Any Call Generated for March after March is a Missed PM.").
--
-- A MISSED PM is a PM call whose Added On date (pm_calls.added_on) falls after
-- the last day of the month it is registered for. The open-rate objective on
-- the PM register (calc_params.family = 'pm') leaves such calls out of both
-- the calls counted and the calls still open -- unless calc_params.missed_pm
-- is 'include', which the toggle on the Objective page sets. A call with no
-- Added On date is never a Missed PM: nothing says it was added late.
--
-- Measured on the live project first (_missed_pm_impact.sql): Q1 2,579 PM
-- calls, 779 missed, 34.12% -> 11.39%; Q2 359 missed, 32.50% -> 20.68%; Q3
-- 290 missed, 44.81% -> 37.27%. The Field and Installation registers carry no
-- Added On date on any 2026 call, and the rule is the PM register's alone.
--
-- objective_value() and objective_evidence() are RESTATED FROM A DATABASE built
-- from every migration; only their open_rate_monthly branch changes, so the
-- figure and its evidence leave out the same calls. Stored figures change on
-- the next Re-Calculate.
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
         -- A MISSED PM (0418): a PM call added after the end of the month it
         -- is registered for. Left out unless the objective says to count it.
         and ($5 or c.added_on is null
              or c.added_on <= (date_trunc('month', c.reg_date) + interval '1 month - 1 day')::date)
    $q$, public.objective_call_table(o.calc_params))
      into n_den, n_num
     using p.period_start, p.period_end,
           coalesce(nullif(btrim(o.calc_params->>'call_type'), ''), '%'),
           p.solve_cutoff,
           (lower(btrim(coalesce(o.calc_params->>'family', ''))) <> 'pm'
                or lower(btrim(coalesce(o.calc_params->>'missed_pm', ''))) = 'include');
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

CREATE OR REPLACE FUNCTION public.objective_evidence(p_id bigint, p_month integer)
 RETURNS TABLE(role text, ucn text, call_number text, reg_date date, product_name text, serial text, party_name text, call_type text, status text, allocated_to text, warranty_number text, warranty_start date, warranty_end date, contract_number text, contract_start date, contract_end date, contract_type text, closure_date date, closure_recorded_on date, after_cutoff text, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o        public.quality_objectives;
  p        record;
  v_serial text;
  v_prod   text;
  v_type   text;
  v_days   integer;
  v_from   date;
  v_upto   date;
  v_win    integer;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found then return; end if;
  -- THE GATE FOLLOWS THE REGISTER THE FIGURE IS COUNTED FROM. An FFR objective
  -- reads the Field Failure Register, which has had its own right since 0176
  -- (`ffr.view`); asking for `calls.view` instead would let somebody who may
  -- not open that register read every report through this door, and refuse
  -- somebody who may.
  if o.calc_key = 'ffr_count_monthly' then
    if not (public.has_perm('ffr.view') or public.has_perm('ffr.manage')) then
      raise exception 'RBAC: you cannot read the Field Failure Reports behind this figure';
    end if;
  elsif not (public.has_perm('calls.view') or public.has_perm('reports.view')) then
    raise exception 'RBAC: you cannot read the calls behind this figure';
  end if;
  select * into p from public.objective_period(p_id, p_month);
  if not found or not p.applies then return; end if;
  v_type := coalesce(nullif(btrim(o.calc_params->>'call_type'), ''), '%');

  if o.calc_key = 'failure_rate_12m' then
    v_prod   := o.calc_params->>'product';
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');
    v_upto   := p.period_end;
    v_from   := (v_upto - make_interval(months => public.objective_setting('failure_rolling_months', 12)))::date;
    v_win    := public.objective_setting('failure_window_months', 3);

    -- (The outer alias is `c`, as on every call branch, so _status.sql row
    -- 193's tiebreak check -- `reg_date desc, c.ucn` -- reads it.)
    -- SHEET 1: ONE ROW PER FAILED MACHINE -- its FIRST field call inside the
    -- window -- so the sheet counts to the numerator. `details` says when the
    -- machine was installed, how many days later it failed, and how many calls
    -- fell inside the window.
    -- EXECUTE for the same reason as objective_value: the app pages this
    -- function, re-running it per thousand rows, and the sixth page would get
    -- the generic plan.
    return query execute $q$
      with base as (
        select pr.*
          from public.products pr
         where pr.item_name ilike $1
           and coalesce(pr.serial_number, '') ilike $2
           and btrim(coalesce(pr.serial_number, '')) <> ''
           and pr.warranty_start > $3
           and pr.warranty_start <= $4
      ),
      hits as (
        select b.id as machine_id, b.warranty_start as installed_on, c.*,
               count(*) over (partition by b.id) as calls_in_window,
               row_number() over (partition by b.id order by c.reg_date, c.ucn) as rn
          from base b
          join public.field_calls c
            on upper(btrim(coalesce(c.serial, ''))) = upper(btrim(b.serial_number))
         where c.cancelled_at is null
           and c.product_name ilike $1
           and c.reg_date > $3
           and c.reg_date <= $4
           and c.reg_date >= b.warranty_start
           and c.reg_date <= (b.warranty_start + make_interval(months => $5))::date
      )
      select 'failure'::text, c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type,
             cl.closed_on, cl.recorded_on, ''::text,
             jsonb_build_object(
               'Installed (warranty start)', c.installed_on,
               'Days after installation', (c.reg_date - c.installed_on),
               'Field calls in the window', c.calls_in_window)
        from hits c
        left join lateral (
              select r.visit_at::date as closed_on, r.updated_at::date as recorded_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%'
               order by coalesce(r.visit_at::date, r.updated_at::date), r.id limit 1) cl on true
       where c.rn = 1
       order by c.reg_date desc, c.ucn
    $q$ using v_prod, v_serial, v_from, v_upto, v_win;

    return query
      select 'filter'::text, ''::text, ''::text, p.period_end,
             'Product Master, Product like ' || v_prod,
             case when v_serial = '%' then '(no serial filter -- product only)'
                  else 'Serial like ' || v_serial end,
             p.label, 'Field calls'::text, ''::text, ''::text,
             ''::text, null::date, null::date, ''::text, null::date, null::date, ''::text,
             null::date, null::date,
             'Installed (warranty start) in the '
               || public.objective_setting('failure_rolling_months', 12)
               || ' months to ' || p.period_end
               || '; failed = a field call within '
               || public.objective_setting('failure_window_months', 3)
               || ' months of installation',
             null::jsonb;

    -- SHEET 2: THE MACHINES INSTALLED IN THE WINDOW -- the denominator -- each
    -- carrying its whole Product Master row.
    return query
      select 'machine'::text, ''::text, ''::text, null::date,
             pr.item_name, pr.serial_number, pr.party_name, ''::text,
             coalesce(pr.item_status, ''), ''::text,
             pr.warranty_number, pr.warranty_start, pr.warranty_end,
             pr.contract_number, pr.contract_start, pr.contract_end, pr.contract_type,
             null::date, null::date, ''::text,
             coalesce(pr.extra, '{}'::jsonb)
        from public.products pr
       where pr.item_name ilike v_prod
         and coalesce(pr.serial_number, '') ilike v_serial
         and btrim(coalesce(pr.serial_number, '')) <> ''
         and pr.warranty_start > v_from
         and pr.warranty_start <= v_upto
       order by pr.serial_number, pr.item_name, pr.id;
    return;
  end if;

  if o.calc_key = 'open_rate_monthly' then
    return query execute format($q$
      select case when cl.counts_on is not null and cl.counts_on <= $4
                  then 'closed' else 'open' end,
             c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type,
             cl.closed_on, cl.recorded_on,
             concat_ws(' ',
               case when cl.counts_on is not null and cl.counts_on > $4
                    then 'YES -- solved on ' || cl.counts_on
                         || ', after the cut-off of ' || $4 || ', so it is counted as OPEN'
               end,
               case when cl.counts_on is not null and cl.closed_on is null
                    then 'NOTE -- no visit date on the solving report; the date it was '
                         'ENTERED (' || cl.recorded_on || ') was used instead'
               end),
             null::jsonb
        from %s c
        left join lateral (
              select r.visit_at::date as closed_on, r.updated_at::date as recorded_on,
                     coalesce(r.visit_at::date, r.updated_at::date) as counts_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%%'
               order by coalesce(r.visit_at::date, r.updated_at::date), r.id limit 1) cl on true
       where c.cancelled_at is null
         and c.call_type ilike $3
         and c.reg_date >= $1 and c.reg_date <= $2
         -- A MISSED PM (0418) is left out of the evidence exactly as it is
         -- left out of the figure, unless the objective counts it.
         and ($5 or c.added_on is null
              or c.added_on <= (date_trunc('month', c.reg_date) + interval '1 month - 1 day')::date)
       order by c.reg_date, c.ucn
    $q$, public.objective_call_table(o.calc_params))
      using p.period_start, p.period_end, v_type, p.solve_cutoff,
            (lower(btrim(coalesce(o.calc_params->>'family', ''))) <> 'pm'
                or lower(btrim(coalesce(o.calc_params->>'missed_pm', ''))) = 'include');
    return;
  end if;

  if o.calc_key = 'attended_within_days' then
    v_days := coalesce((o.calc_params->>'days')::integer, 3);
    return query execute format($q$
      with c as (
        select cc.*, greatest(cc.complaint_date,
                              coalesce(cc.reg_at::date, cc.reg_date)) as counts_from
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
      select case when least(fv.on_date, fs.on_date) is not null
                   and c.counts_from is not null
                   and greatest((least(fv.on_date, fs.on_date) - c.counts_from)::int, 0) <= $4
                  then 'attended' else 'late' end,
             c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             case when least(fv.on_date, fs.on_date) is null then 'never attended'
                  else 'attended on ' || least(fv.on_date, fs.on_date)
                       || ' -- ' || greatest((least(fv.on_date, fs.on_date) - c.counts_from)::int, 0)
                       || ' day(s) from ' || c.counts_from end,
             coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type,
             cl.closed_on, cl.recorded_on, ''::text, null::jsonb
        from c
        left join fv on fv.ucn = c.ucn
        left join fs on fs.ucn = c.ucn
        left join lateral (
              select r.visit_at::date as closed_on, r.updated_at::date as recorded_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%%'
               order by coalesce(r.visit_at::date, r.updated_at::date), r.id limit 1) cl on true
       order by c.reg_date, c.ucn
    $q$, public.objective_call_table(o.calc_params))
      using p.period_start, p.period_end, v_type, v_days;
    return;
  end if;

  if o.calc_key = 'ffr_count_monthly' then
    v_prod   := coalesce(nullif(btrim(o.calc_params->>'product'), ''), '%');
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');

    -- ONE ROW PER MACHINE, because that is how the register stores it -- so the
    -- sheet has MORE rows than the figure and every row says which report it
    -- belongs to. Collapsing to one row per report here would hide which
    -- machines it covered, which is the thing 0181 exists to keep.
    return query
      select 'ffr'::text, f.ucn, f.ffr_no,
             f.ffr_date,
             f.product_name, f.product_serial, f.customer_name,
             coalesce(f.call_type, ''), coalesce(f.ffr_status, ''),
             coalesce(f.raised_by_name, ''),
             ''::text, null::date, null::date, ''::text, null::date, null::date,
             coalesce(f.cover, ''),
             f.crn_date, f.created_at::date,
             ''::text,
             jsonb_strip_nulls(jsonb_build_object(
               'FFR No', f.ffr_no, 'Source', f.source,
               'Problem Reported', f.problem_reported,
               'Service Observation', f.service_observation,
               'Problem Status', f.problem_status,
               'CAPA No', f.capa_no, 'CAPA Status', f.capa_status,
               'Item Code', f.item_code, 'Place', f.place))
        from public.field_failure_reports f
       where coalesce(f.product_name, '') ilike v_prod
         and coalesce(f.product_serial, '') ilike v_serial
         and f.ffr_date >= p.period_start
         and f.ffr_date <= p.period_end
       order by f.ffr_date, f.ffr_no, f.id;
    return;
  end if;
end $function$;
