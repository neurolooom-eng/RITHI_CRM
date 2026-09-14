-- ===========================================================================
-- 0142 — THE FIELD FAILURE COUNT CALCULATES ITSELF.
--
-- The user, 2026-09-14: "Objective - Automate / Calculate -> No.of Field
-- failures registered in FFR ; Logic = No of FFRs registered for the Month".
--
-- Objective 1 has been a TYPED figure since 0130 — the only SERVICE objective
-- that still was. It now carries `calc_key = 'ffr_count_monthly'` and
-- Re-Calculate writes it like the rest.
--
-- WHAT IS DIFFERENT ABOUT IT, and it is the reason this file is longer than the
-- one branch it adds: every other computed objective here is a RATE. This is
-- the first COUNT, and three of this page's habits are wrong for a count:
--
--   1. A rate returns NULL on an empty denominator, because a rate over nothing
--      is undefined. A count over nothing is NOUGHT. On an objective whose
--      target is "To Monitor" the difference matters more than usual: "no
--      failures were registered in March" is the finding, and a blank cell
--      would report it as "March has not been measured".
--   2. A rate is one figure over another, so the evidence workbook is built
--      around `numerator ÷ denominator`. A count has no denominator, and a
--      sheet reading "12 ÷ 12" would be arithmetic nobody performed. The page
--      lays a count out as a count (src/modules/Objective.tsx).
--   3. One FFR can cover SEVERAL MACHINES. 0181 made the register one row per
--      machine for exactly that reason, and measured it: eight FFR numbers
--      across twelve machines in the user's own files. So the figure counts
--      DISTINCT FFR NUMBERS while the evidence lists every machine row — the
--      sheet legitimately has more rows than the figure, and says so.
--
-- THREE FUNCTIONS ARE RE-STATED IN FULL, not patched: `objective_value`,
-- `objective_evidence` and `objective_notes` are each defined by several files
-- in this module already (0132/0133/0136/0137/0138 for the first), and the
-- bundles are replayed ONE AT A TIME. A file that added only its own branch
-- would be undone the moment an earlier one replayed. This file is LAST in the
-- module, so what it says is what the module ends with — `check:replay` is what
-- proves that and it is run on every change here.
--
-- `objective_evidence` is DROPPED first rather than replaced: `create or
-- replace function` cannot change a return type, and 0140 widened this one.
-- The bundle has to be runnable on a database in any state, not only a fresh
-- one.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- THE FIGURE.
-- ---------------------------------------------------------------------------
create or replace function public.objective_value(p_id bigint, p_month integer)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  o        public.quality_objectives;
  p        record;
  v_serial text;
  v_prod   text;
  v_days   integer;
  n_num    integer;
  n_den    integer;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found or o.calc_key = '' then return null; end if;

  select * into p from public.objective_period(p_id, p_month);
  if not found or not p.applies then return null; end if;

  if o.calc_key = 'failure_rate_12m' then
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');
    select count(*) into n_num from public.field_calls c
     where c.cancelled_at is null
       and c.product_name ilike (o.calc_params->>'product')
       and coalesce(c.serial, '') ilike v_serial
       and c.reg_date > (p.period_end - interval '12 months')::date
       and c.reg_date <= p.period_end;
    select count(*) into n_den from public.products
     where item_name ilike (o.calc_params->>'product')
       and coalesce(serial_number, '') ilike v_serial;
    if coalesce(n_den, 0) = 0 then return null; end if;   -- no fleet, no rate
    return round(n_num::numeric / n_den, 6);
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
end $$;
revoke all on function public.objective_value(bigint, integer) from public;
grant execute on function public.objective_value(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- THE ROWS BEHIND IT. Every computed figure on this page can be interrogated,
-- and a new calc_key without an evidence branch would silently break that
-- promise — the download would come back empty and read as a fault.
-- ---------------------------------------------------------------------------
drop function if exists public.objective_evidence(bigint, integer);

create function public.objective_evidence(p_id bigint, p_month integer)
returns table (
  role text, ucn text, call_number text, reg_date date, product_name text,
  serial text, party_name text, call_type text, status text, allocated_to text,
  warranty_number text, warranty_start date, warranty_end date,
  contract_number text, contract_start date, contract_end date, contract_type text,
  closure_date date, closure_recorded_on date, after_cutoff text,
  details jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare
  o        public.quality_objectives;
  p        record;
  v_serial text;
  v_prod   text;
  v_type   text;
  v_days   integer;
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

    return query
      select 'failure'::text, c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type,
             cl.closed_on, cl.recorded_on, ''::text, null::jsonb
        from public.field_calls c
        left join lateral (
              select r.visit_at::date as closed_on, r.updated_at::date as recorded_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%'
               order by coalesce(r.visit_at::date, r.updated_at::date), r.id limit 1) cl on true
       where c.cancelled_at is null
         and c.product_name ilike v_prod
         and coalesce(c.serial, '') ilike v_serial
         and c.reg_date > (p.period_end - interval '12 months')::date
         and c.reg_date <= p.period_end
       order by c.reg_date desc;

    return query
      select 'filter'::text, ''::text, ''::text, p.period_end,
             'Product Master, Product like ' || v_prod,
             case when v_serial = '%' then '(no serial filter -- product only)'
                  else 'Serial like ' || v_serial end,
             p.label, 'Field calls'::text, ''::text, ''::text,
             ''::text, null::date, null::date, ''::text, null::date, null::date, ''::text,
             null::date, null::date, ''::text, null::jsonb;

    -- THE MACHINES, each carrying its whole Product Master row: the columns
    -- above, plus everything the upload kept in `extra` under the spreadsheet's
    -- own headings.
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
       order by pr.serial_number;
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
       order by c.reg_date
    $q$, public.objective_call_table(o.calc_params))
      using p.period_start, p.period_end, v_type, p.solve_cutoff;
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
       order by c.reg_date
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
end $$;

revoke all on function public.objective_evidence(bigint, integer) from public;
grant execute on function public.objective_evidence(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- WHAT THE NUMBER MEANS, in the database's own words, so the workbook cannot
-- describe it with the previous objective's rules.
-- ---------------------------------------------------------------------------
create or replace function public.objective_notes(p_id bigint, p_month integer)
returns table (kind text, note text)
language plpgsql stable security definer set search_path = public as $$
declare
  o  public.quality_objectives;
  p  record;
  q  boolean;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found then return; end if;
  select * into p from public.objective_period(p_id, p_month);
  q := public.objective_is_quarterly(o.frequency);

  kind := 'ASSUMPTION';
  note := 'Measured ' || case when q then 'QUARTERLY' else 'MONTHLY' end
          || ', taken from this objective''s Monitoring Frequency ('
          || coalesce(nullif(btrim(o.frequency), ''), 'not set') || ').';
  return next;

  if q then
    note := 'A quarterly figure is CUMULATIVE over the three months -- one fraction '
            'over the whole window, NOT the average of three monthly rates. Averaging '
            'would give a month with four calls the same weight as a month with ninety.';
    return next;
    note := 'It is reported in the LAST month of the quarter, and takes THAT month''s '
            'cut-off. The other two months are NA (blank), which is not zero.';
    return next;
  end if;

  if o.calc_key = '' then
    kind := 'HARD STOP';
    note := 'This objective is NOT computed -- the figure on the page was TYPED by a '
            'person, and Re-Calculate never touches it. There are no rows behind it.';
    return next;
    return;
  end if;

  if o.calc_key = 'ffr_count_monthly' then
    note := 'Counted from the FIELD FAILURE REGISTER (field_failure_reports), not from '
            'the call register. A call is not a field failure until somebody raises a '
            'report for it.';
    return next;
    note := 'The figure counts FFR NUMBERS, not rows. One report can cover several '
            'machines -- the register stores a row for each -- so the evidence sheet has '
            'MORE rows than the figure, and that is not a disagreement.';
    return next;
    note := 'A report belongs to the month by its FFR DATE -- the date on the report, not '
            'the date it was typed in, and not the date of the call behind it. There is no '
            'fallback because none is reachable: the register requires an FFR date and '
            'defaults it to the day the report is raised.';
    return next;
    if coalesce(btrim(o.calc_params->>'product'), '') <> '' then
      note := 'Narrowed to products matching "' || (o.calc_params->>'product')
              || '" -- an administrator set this on the screen.';
      return next;
    end if;
    if coalesce(btrim(o.calc_params->>'serial'), '') <> '' then
      note := 'Narrowed to serials matching "' || (o.calc_params->>'serial') || '".';
      return next;
    end if;
    kind := 'HARD STOP';
    note := 'ZERO IS AN ANSWER HERE, not a blank. A month with no field failures reads 0; '
            'a month that has not been measured is blank. The rate objectives on this page '
            'do the opposite -- a rate over no machines is undefined and stays blank -- so '
            'the two are deliberately not the same.';
    return next;
    note := 'This is a COUNT, so there is no denominator and nothing to express as a '
            'percentage. The target is "To Monitor": no line has been drawn, so the figure '
            'is never coloured pass or fail.';
    return next;
    kind := 'ASSUMPTION';
  end if;

  if o.calc_key in ('open_rate_monthly', 'attended_within_days') then
    note := 'Counted from the ' || public.objective_register_name(o.calc_params)
            || ' register (' || public.objective_call_table(o.calc_params) || ').';
    return next;
    if coalesce(btrim(o.calc_params->>'call_type'), '') <> '' then
      note := 'Narrowed further to call types matching "' || (o.calc_params->>'call_type')
              || '" -- an administrator set this on the screen.';
      return next;
    end if;
    note := 'A call belongs to the period by its CALL REGISTRATION DATE, not by when '
            'it was attended or solved. The cut-off below never changes WHICH calls '
            'are counted, only how many of them were closed in time.';
    return next;
  end if;

  if o.calc_key = 'open_rate_monthly' then
    note := 'CUT-OFF: ' || coalesce(p.cutoff_note, 'the end of the period.');
    return next;
    note := 'EACH MONTH CARRIES ITS OWN CUT-OFF. Setting this month''s does not touch '
            'any other month, so a figure already reported cannot be re-based by a '
            'later round.';
    return next;
    note := 'A call counts as CLOSED once any visit records a status beginning "Solved" '
            '-- so "Solved - Report Pending" is closed, per the sheet.';
    return next;
    note := 'The cut-off tests the VISIT DATE of that report -- when the engineer '
            'attended -- NOT the date it was typed up. Both are on Sheet 1 (Call '
            'closure date / Closure recorded on).';
    return next;
    note := 'Where a solving report carries NO visit date, the date it was ENTERED is '
            'used instead, and Sheet 1 says so on that row. Treating a blank as "never '
            'solved" would move a closed call into the open column for a missing '
            'keystroke, making the figure worse for a data-entry lapse.';
    return next;
  end if;

  if o.calc_key = 'attended_within_days' then
    note := 'ATTENDED is the EARLIER of the first visit date and the first spare-request '
            'date -- the same Call Attended rule the KPI export uses, so the two agree.';
    return next;
    note := 'The clock runs from the LATER of the complaint date and the registration '
            'date, again matching the KPI export''s "Attended in Days".';
    return next;
  end if;

  if o.calc_key = 'failure_rate_12m' then
    note := 'Failures are FIELD calls on products matching "'
            || coalesce(o.calc_params->>'product', '(none set)') || '".';
    return next;
    note := case when coalesce(btrim(o.calc_params->>'serial'), '') = ''
                 then 'No serial filter -- every machine of that product is counted.'
                 else 'Narrowed to serial numbers matching "' || (o.calc_params->>'serial')
                      || '" -- how the Indian Extend is told from the rest, since no '
                      'column says Indian.' end;
    return next;
    note := 'The installed base is a PRODUCT MASTER listing and is counted AS IT STANDS '
            'TODAY. Product Master keeps no history of what was installed in an earlier '
            'month, so an old month''s rate uses today''s fleet.';
    return next;
    note := 'Product Master''s "active" flag is NOT honoured: nothing in this system '
            'maintains it, and filtering on it would move every rate on the strength of '
            'data that has never been kept.';
    return next;
  end if;

  kind := 'HARD STOP';
  note := 'CANCELLED CALLS ARE NEVER COUNTED -- not in the numerator, not in the '
          'denominator.';
  return next;
  note := 'Calls are those REGISTERED between '
          || coalesce(p.period_start::text, '(period not reached)') || ' and '
          || coalesce(p.period_end::text, '(period not reached)')
          || ' -- the last day of the period or TODAY, whichever is earlier.';
  return next;
  if o.calc_key = 'open_rate_monthly' then
    note := 'A CUT-OFF IS NEVER LATER THAN TODAY, whatever is set. A future cut-off '
            'would count a month the record cannot yet know about, and it can only ever '
            'move a call from open to closed -- so it would flatter the figure, which '
            'is the direction nobody questions.';
    return next;
    note := 'A call solved AFTER the cut-off is counted as OPEN. It is marked on Sheet 1 '
            'rather than hidden, because "still open" and "solved, but later" are '
            'different facts and only one of them is a problem.';
    return next;
  end if;
  note := 'A period with NO calls gives NO rate -- the cell stays blank. It is never '
          'written as 0%, which would read as "nothing was open".';
  return next;
  note := 'Figures are written ONLY by an explicit Re-Calculate. Nothing on this page '
          'changes because somebody opened it.';
  return next;
  note := 'Re-Calculate never overwrites a TYPED figure, and never writes a month that '
          'has not been reached.';
  return next;

  if o.calc_key = 'failure_rate_12m' then
    note := 'The window is a rolling TWELVE MONTHS ending at the cutoff -- that is what '
            '"recent failure rate" means, and it does not shorten for an early month. '
            'A window reaching back before the data begins reports a rate that is too '
            'LOW, and it will not look wrong: check the earliest date on Sheet 1.';
    return next;
  end if;
end $$;
revoke all on function public.objective_notes(bigint, integer) from public;
grant execute on function public.objective_notes(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- POINT OBJECTIVE 1 AT IT.
--
-- GUARDED ON `calc_key = ''`, the same guard 0136 uses and for the same reason:
-- an administrator may have pointed this objective somewhere else from the
-- screen, and a migration that overwrote their choice would undo it silently on
-- every replay. Matched on the PARAMETER TEXT rather than on sort_order, since
-- the order is editable and the wording is what identifies the row.
--
-- Every year, not just 2026: the objectives are copied forward, and a 2027 row
-- with the same parameter wants the same calculation.
-- ---------------------------------------------------------------------------
update public.quality_objectives
   set calc_key = 'ffr_count_monthly',
       calc_params = case when calc_params = '{}'::jsonb or calc_params is null
                          then '{}'::jsonb else calc_params end,
       source = 'Field Failure Register'
 where calc_key = ''
   and lower(btrim(parameter)) like '%field failure%'
   and lower(btrim(parameter)) like '%ffr%';

comment on column public.quality_objectives.calc_key is
  'Which calculation produces this objective''s monthly figures, or '''' when the figure is typed. failure_rate_12m = failures on a product in the trailing 12 months over the installed base; open_rate_monthly = calls of a family registered in the period that were not solved by the cut-off; attended_within_days = calls attended inside a day limit; ffr_count_monthly = how many Field Failure Reports were registered in the period, counted by FFR number.';
