-- ===========================================================================
-- D-173 (re-review 5, 2026-10-12): the Customer feedback objective's evidence
-- follows the FEEDBACK register's read rule.
--
-- objective_evidence() admitted every objective but the FFR one on calls.view
-- or reports.view -- including feedback_satisfaction, whose evidence returns
-- every answer, the party, the UCN and the engineer. Measured: a calls.view
-- holder who reads 0 feedback rows directly read them here, and a feedback.view
-- holder who reads them directly was refused here. The function's own comment
-- states the rule this breaks: the gate follows the register the figure is
-- counted from.
--
-- The body below is the DATABASE'S definition (pg_get_functiondef on a database
-- built from every migration, latest 0441), with the one branch added to the
-- gate; nothing else changes.
-- ===========================================================================
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
  -- 0460 (D-173): the Customer feedback objective is counted from the FEEDBACK
  -- register, so its evidence -- every answer, party and engineer -- follows
  -- that register's read rule (fb_read: feedback.view or visit.feedback), not
  -- the calls' rule.
  elsif o.calc_key = 'feedback_satisfaction' then
    if not (public.has_perm('feedback.view') or public.has_perm('visit.feedback')) then
      raise exception 'RBAC: you cannot read the customer feedback behind this figure';
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
              select (r.visit_at at time zone 'Asia/Kolkata')::date as closed_on, (r.updated_at at time zone 'Asia/Kolkata')::date as recorded_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%'
               order by coalesce((r.visit_at at time zone 'Asia/Kolkata')::date, (r.updated_at at time zone 'Asia/Kolkata')::date), r.id limit 1) cl on true
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
              select (r.visit_at at time zone 'Asia/Kolkata')::date as closed_on, (r.updated_at at time zone 'Asia/Kolkata')::date as recorded_on,
                     coalesce((r.visit_at at time zone 'Asia/Kolkata')::date, (r.updated_at at time zone 'Asia/Kolkata')::date) as counts_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%%'
               order by coalesce((r.visit_at at time zone 'Asia/Kolkata')::date, (r.updated_at at time zone 'Asia/Kolkata')::date), r.id limit 1) cl on true
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
        select cc.*, coalesce((cc.reg_at at time zone 'Asia/Kolkata')::date, cc.reg_date) as reg_day
          from %s cc
         where cc.cancelled_at is null
           and cc.call_type ilike $3
           and cc.reg_date >= $1 and cc.reg_date <= $2
      ),
      fv as (select ucn, min((visit_at at time zone 'Asia/Kolkata')::date) as on_date from public.reports
              where visit_at is not null group by ucn),
      fs as (select ucn, min(coalesce(or_req_date, (created_at at time zone 'Asia/Kolkata')::date)) as on_date
               from public.spare_requests
              where coalesce(btrim(ucn), '') <> '' group by ucn)
      select case when public.call_days(c.complaint_date, c.breakdown_date, c.reg_day, least(fv.on_date, fs.on_date)) <= $4
                  then 'attended' else 'late' end,
             c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             case when least(fv.on_date, fs.on_date) is null then 'never attended'
                  else 'attended on ' || least(fv.on_date, fs.on_date)
                       || ' -- ' || public.call_days(c.complaint_date, c.breakdown_date, c.reg_day, least(fv.on_date, fs.on_date))
                       || ' day(s), the lower of from complaint ' || coalesce(c.complaint_date::text, '-')
                       || ' and from breakdown ' || coalesce(c.breakdown_date::text, '-') end,
             coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type,
             cl.closed_on, cl.recorded_on, ''::text, null::jsonb
        from c
        left join fv on fv.ucn = c.ucn
        left join fs on fs.ucn = c.ucn
        left join lateral (
              select (r.visit_at at time zone 'Asia/Kolkata')::date as closed_on, (r.updated_at at time zone 'Asia/Kolkata')::date as recorded_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%%'
               order by coalesce((r.visit_at at time zone 'Asia/Kolkata')::date, (r.updated_at at time zone 'Asia/Kolkata')::date), r.id limit 1) cl on true
       order by c.reg_date, c.ucn
    $q$, public.objective_call_table(o.calc_params))
      using p.period_start, p.period_end, v_type, v_days;
    return;
  end if;

  -- CUSTOMER FEEDBACK SATISFACTION (0422): one row per feedback counted --
  -- the call, its visit date (reg_date column), and in `details` each
  -- question's score and the call's Satisfaction %, so the sheet adds up to
  -- the figure.
  if o.calc_key = 'feedback_satisfaction' then
    return query
      select 'feedback'::text, f.ucn, f.call_number, (f.visit_at at time zone 'Asia/Kolkata')::date,
             f.product_name, f.serial, f.party_name, f.call_type, ''::text, coalesce(f.engineer, ''),
             null::text, null::date, null::date, null::text, null::date, null::date, null::text,
             null::date, null::date, null::text,
             jsonb_build_object('Satisfaction %', public.feedback_satisfaction(f.answers, f.call_type),
                                'Scored on', case when upper(coalesce(f.call_type, '')) like '%INSTALLATION%'
                                                  then 'Installation questions (out of 20)' else 'PM / Field questions (out of 24)' end)
               || coalesce((select jsonb_object_agg(q, public.feedback_score(f.answers ->> q))
                              from unnest(public.feedback_questions(f.call_type)) q), '{}'::jsonb)
        from public.feedback f
       where (f.visit_at at time zone 'Asia/Kolkata')::date >= p.period_start
         and (f.visit_at at time zone 'Asia/Kolkata')::date <= p.period_end
         and public.feedback_satisfaction(f.answers, f.call_type) is not null
       order by f.visit_at, f.ucn;
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
             f.crn_date, (f.created_at at time zone 'Asia/Kolkata')::date,
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
