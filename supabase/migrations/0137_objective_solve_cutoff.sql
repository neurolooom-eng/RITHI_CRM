-- ===========================================================================
-- A SETTABLE CUT-OFF FOR "SOLVED BY", AND A FILE THAT NAMES WHAT IT EXCLUDED.
--
-- The user, 2026-09-07:
--   "1. For KPI 8, 9, 10 - Give me a Provision to select a Cut Off Date for
--    Calculation
--    2. Give me the Actual Call Closure Date in the Export And Explicitly call
--    out that the Call was Solved After the Set Cut Off Date."
--
-- THE TWO DATES WERE ONE DATE, AND THEY ARE DIFFERENT QUESTIONS. Until now the
-- period end did two jobs at once: it decided WHICH CALLS COUNT (registered in
-- the period) and WHETHER EACH WAS CLOSED (solved by then). Only the second is
-- what a cut-off is about -- "no calls registered in the month, solved by X" --
-- and moving the period end would silently pull in calls registered after the
-- month, changing the denominator nobody asked to change.
--
-- So they are separated. `period_start`..`period_end` remains the REGISTRATION
-- window and does not move. `solve_cutoff` is new: the date by which a solve
-- must have been recorded for the call to count as closed.
--
--   nothing set          solve_cutoff = period_end          (today's behaviour,
--                                                            unchanged)
--   {"cutoff_days": 5}   five days' grace after the period ends -- the honest
--                        answer to reports that are entered a few days late,
--                        and the one that works for all twelve months at once
--   {"cutoff_date": ...} one fixed date, for reporting a period AS AT a stated
--                        day (a review meeting, an audit)
--
-- NEVER LATER THAN TODAY, whichever is set. That is not a preference: a cut-off
-- in the future would count a period as finished when the record cannot yet
-- know what happened, and every figure under it would drift upward on its own.
-- The cut-off can only ever move a call from open to CLOSED, so an ungrounded
-- one flatters the number, which is the direction nobody questions.
--
-- WHAT THE FILE NOW SHOWS. A call solved after the cut-off is still counted as
-- OPEN -- that is the whole point of a cut-off -- but it is no longer
-- indistinguishable from one that was never solved at all. The evidence gains
-- three columns:
--
--   closure_date        the CALL CLOSURE DATE: the visit date of the report
--                       that solved it (the user's Phase 1 rule -- "Visit date
--                       of this action is Considered as the Call Solved Date")
--   closure_recorded_on when that report was ENTERED, which is what the cut-off
--                       actually tests
--   after_cutoff        'YES -- solved after the cut-off' on the calls the
--                       cut-off excluded, blank otherwise
--
-- THE TWO CLOSURE DATES ARE BOTH SHOWN BECAUSE THEY DISAGREE, and the
-- disagreement is the interesting part: a visit on the 28th entered on the 3rd
-- is a call solved inside the month by a record written after it. The cut-off
-- tests the ENTRY, unchanged from before -- what a register can defend is when
-- it was told, not when it later turns out something happened -- and now that
-- both dates are on the sheet, anyone who wants the other rule can see exactly
-- which calls it would move before asking for it.
--
-- Both function signatures widen, so both are DROPPED and recreated:
-- `create or replace function` cannot change a return type.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- THE WINDOW, PLUS THE DATE A SOLVE MUST BE RECORDED BY.
-- ---------------------------------------------------------------------------
-- Dropped first for the same reason 0136 does: 0139 rebuilds this function and
-- a table return type cannot be replaced in place.
drop function if exists public.objective_period(bigint, integer);

create function public.objective_period(p_id bigint, p_month integer)
returns table (applies boolean, period_start date, period_end date,
               solve_cutoff date, label text, cutoff_note text)
language plpgsql stable security definer set search_path = public as $$
declare
  o        public.quality_objectives;
  cutoff   date;
  today    date := (now() at time zone 'Asia/Kolkata')::date;
  q_first  integer;
  v_days   integer;
  v_date   date;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found then return; end if;
  if p_month < 1 or p_month > 12 then return; end if;

  cutoff := public.objective_cutoff(o.year, p_month);

  -- The month has not been reached at all: nothing to measure, either way.
  if cutoff < make_date(o.year, p_month, 1) then
    applies := false; period_start := null; period_end := null;
    solve_cutoff := null; label := ''; cutoff_note := '';
    return next; return;
  end if;

  if public.objective_is_quarterly(o.frequency) then
    if p_month % 3 <> 0 then
      applies := false; period_start := null; period_end := null;
      solve_cutoff := null; cutoff_note := '';
      label := 'NA -- a quarterly objective is measured in the last month of its quarter';
      return next; return;
    end if;
    q_first      := p_month - 2;
    applies      := true;
    period_start := make_date(o.year, q_first, 1);
    period_end   := cutoff;
    label := 'Q' || (p_month / 3)::text || ' ('
             || to_char(make_date(o.year, q_first, 1), 'Mon') || '-'
             || to_char(make_date(o.year, p_month, 1), 'Mon') || ' ' || o.year || ')';
  else
    applies      := true;
    period_start := make_date(o.year, p_month, 1);
    period_end   := cutoff;
    label        := to_char(make_date(o.year, p_month, 1), 'Mon') || ' ' || o.year;
  end if;

  -- ---- the solve cut-off ---------------------------------------------------
  -- A fixed date wins over a grace, because it is the more specific
  -- instruction: somebody naming a date means that date.
  v_date := nullif(btrim(coalesce(o.calc_params->>'cutoff_date', '')), '')::date;
  v_days := nullif(btrim(coalesce(o.calc_params->>'cutoff_days', '')), '')::integer;

  if v_date is not null then
    solve_cutoff := least(v_date, today);
    cutoff_note  := 'Solved by ' || solve_cutoff
                    || ' (a fixed cut-off date set on this objective'
                    || case when v_date > today
                            then ', capped at today -- the record cannot yet know about a later solve'
                            else '' end || ').';
  elsif v_days is not null and v_days <> 0 then
    solve_cutoff := least((period_end + v_days)::date, today);
    cutoff_note  := 'Solved by ' || solve_cutoff || ' -- ' || v_days
                    || ' day(s) after the period ended, the grace set on this objective'
                    || case when (period_end + v_days)::date > today
                            then ', capped at today' else '' end || '.';
  else
    solve_cutoff := period_end;
    cutoff_note  := 'Solved by ' || solve_cutoff
                    || ' -- the end of the period, no grace set.';
  end if;

  return next;
end $$;
revoke all on function public.objective_period(bigint, integer) from public;
grant execute on function public.objective_period(bigint, integer) to authenticated;

comment on function public.objective_period(bigint, integer) is
  'The window one figure is measured over, and the date a solve must be RECORDED by. period_start..period_end is the REGISTRATION window and never moves; solve_cutoff is period_end unless calc_params sets cutoff_date (a fixed date) or cutoff_days (a grace after the period). Both are capped at today -- a cut-off in the future would count a period the record cannot yet know about, and can only ever flatter the figure.';

-- ---------------------------------------------------------------------------
-- THE FIGURE. Only the open-rate changes: it tests the SOLVE CUT-OFF rather
-- than the period end. The registration window is untouched, so a grace can
-- never change which calls are counted -- only how many of them were closed.
-- ---------------------------------------------------------------------------
create or replace function public.objective_value(p_id bigint, p_month integer)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  o        public.quality_objectives;
  p        record;
  v_serial text;
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
    execute format($q$
      select count(*),
             count(*) filter (where not exists (
               select 1 from public.reports r
                where r.ucn = c.ucn and r.call_status ilike 'solved%%'
                  and r.updated_at::date <= $4))
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

  return null;
end $$;
revoke all on function public.objective_value(bigint, integer) from public;
grant execute on function public.objective_value(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- THE EVIDENCE, now carrying the actual closure date and the callout.
--
-- `closure` is the FIRST report that solved the call, ranked by when it was
-- ENTERED -- the same ordering `sync_call_last_visit()` uses, and the same one
-- the cut-off tests. Its `visit_at` is the Call Closure Date; its `updated_at`
-- is when the register was told.
-- ---------------------------------------------------------------------------
drop function if exists public.objective_evidence(bigint, integer);

create function public.objective_evidence(p_id bigint, p_month integer)
returns table (
  role text, ucn text, call_number text, reg_date date, product_name text,
  serial text, party_name text, call_type text, status text, allocated_to text,
  warranty_number text, warranty_start date, warranty_end date,
  contract_number text, contract_start date, contract_end date, contract_type text,
  closure_date date, closure_recorded_on date, after_cutoff text
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
  if not (public.has_perm('calls.view') or public.has_perm('reports.view')) then
    raise exception 'RBAC: you cannot read the calls behind this figure';
  end if;
  select * into p from public.objective_period(p_id, p_month);
  if not found or not p.applies then return; end if;
  v_type := coalesce(nullif(btrim(o.calc_params->>'call_type'), ''), '%');

  if o.calc_key = 'failure_rate_12m' then
    v_prod   := o.calc_params->>'product';
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');

    -- SHEET 1 -- the failures counted, the trailing twelve months to the cutoff.
    return query
      select 'failure'::text, c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type,
             cl.closed_on, cl.recorded_on, ''::text
        from public.field_calls c
        left join lateral (
              select r.visit_at::date as closed_on, r.updated_at::date as recorded_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%'
               order by r.updated_at, r.id limit 1) cl on true
       where c.cancelled_at is null
         and c.product_name ilike v_prod
         and coalesce(c.serial, '') ilike v_serial
         and c.reg_date > (p.period_end - interval '12 months')::date
         and c.reg_date <= p.period_end
       order by c.reg_date desc;

    -- SHEET 2 -- WHAT WAS FILTERED, then the Product Master rows it selected.
    return query
      select 'filter'::text, ''::text, ''::text, p.period_end,
             'Product Master, Product like ' || v_prod,
             case when v_serial = '%' then '(no serial filter -- product only)'
                  else 'Serial like ' || v_serial end,
             p.label, 'Field calls'::text, ''::text, ''::text,
             ''::text, null::date, null::date, ''::text, null::date, null::date, ''::text,
             null::date, null::date, ''::text;
    return query
      select 'machine'::text, ''::text, ''::text, null::date,
             pr.item_name, pr.serial_number, pr.party_name, ''::text,
             coalesce(pr.item_status, ''), ''::text,
             pr.warranty_number, pr.warranty_start, pr.warranty_end,
             pr.contract_number, pr.contract_start, pr.contract_end, pr.contract_type,
             null::date, null::date, ''::text
        from public.products pr
       where pr.item_name ilike v_prod
         and coalesce(pr.serial_number, '') ilike v_serial
       order by pr.serial_number;
    return;
  end if;

  if o.calc_key = 'open_rate_monthly' then
    -- SHEET 1 -- every call registered in the PERIOD (the denominator), each
    -- labelled open or closed AT THE CUT-OFF (the numerator), and each carrying
    -- its actual closure date whether or not the cut-off admitted it.
    --
    -- A call solved after the cut-off is counted as OPEN -- that is what a
    -- cut-off is -- and says so in `after_cutoff`, so it is never confused with
    -- one that was simply never solved.
    return query execute format($q$
      select case when cl.recorded_on is not null and cl.recorded_on <= $4
                  then 'closed' else 'open' end,
             c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type,
             cl.closed_on, cl.recorded_on,
             case when cl.recorded_on is not null and cl.recorded_on > $4
                  then 'YES -- solved after the cut-off of ' || $4
                       || ', so it is counted as OPEN'
                  else '' end
        from %s c
        left join lateral (
              select r.visit_at::date as closed_on, r.updated_at::date as recorded_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%%'
               order by r.updated_at, r.id limit 1) cl on true
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
             cl.closed_on, cl.recorded_on, ''::text
        from c
        left join fv on fv.ucn = c.ucn
        left join fs on fs.ucn = c.ucn
        left join lateral (
              select r.visit_at::date as closed_on, r.updated_at::date as recorded_on
                from public.reports r
               where r.ucn = c.ucn and r.call_status ilike 'solved%%'
               order by r.updated_at, r.id limit 1) cl on true
       order by c.reg_date
    $q$, public.objective_call_table(o.calc_params))
      using p.period_start, p.period_end, v_type, v_days;
    return;
  end if;
end $$;
revoke all on function public.objective_evidence(bigint, integer) from public;
grant execute on function public.objective_evidence(bigint, integer) to authenticated;

comment on function public.objective_evidence(bigint, integer) is
  'The rows behind one objective in one period, each carrying its CALL CLOSURE DATE (the solving visit), when that was RECORDED, and an explicit callout on a call solved AFTER the cut-off -- which is counted as open, but is not the same thing as never solved. Same window, register and cut-off as objective_value, so the figure and its working cannot disagree.';

-- ---------------------------------------------------------------------------
-- THE NOTES, now naming the cut-off that was applied.
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

  -- ---- what was chosen -----------------------------------------------------
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
    note := 'It is reported in the LAST month of the quarter. The other two months are '
            'NA (blank), which is not zero.';
    return next;
  end if;

  if o.calc_key = '' then
    kind := 'HARD STOP';
    note := 'This objective is NOT computed -- the figure on the page was TYPED by a '
            'person, and Re-Calculate never touches it. There are no rows behind it.';
    return next;
    return;
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
    note := 'A call counts as CLOSED once any visit records a status beginning "Solved" '
            '-- so "Solved - Report Pending" is closed, per the sheet.';
    return next;
    note := 'The cut-off tests when the solving report was ENTERED, not the date of the '
            'visit itself. Both dates are on Sheet 1 (Call closure date / Closure '
            'recorded on) so a call solved late in a period but written up afterwards '
            'can be seen rather than argued about.';
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

  -- ---- what the figure will not do ----------------------------------------
  kind := 'HARD STOP';
  note := 'CANCELLED CALLS ARE NEVER COUNTED -- not in the numerator, not in the '
          'denominator.';
  return next;
  note := 'Calls are those REGISTERED between '
          || coalesce(p.period_start::text, '(period not reached)') || ' and '
          || coalesce(p.period_end::text, '(period not reached)')
          || ' -- the last day of the period or TODAY, whichever is earlier. An '
          'earlier period''s figure does not drift as calls are registered later.';
  return next;
  if o.calc_key = 'open_rate_monthly' then
    note := 'A CUT-OFF IS NEVER LATER THAN TODAY, whatever is set on the objective. A '
            'future cut-off would count a period the record cannot yet know about, and '
            'it can only ever move a call from open to closed -- so it would flatter '
            'the figure, which is the direction nobody questions.';
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
