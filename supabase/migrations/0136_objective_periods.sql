-- ===========================================================================
-- A QUARTERLY OBJECTIVE IS MEASURED OVER ITS QUARTER, AND THE FILE SAYS SO.
--
-- The user, 2026-09-07:
--   "8 - No of calls registered in the month based on Call Registration date -
--    Solved calls by End of Month. same for preventive maintenance,
--    Installation calls[.] customer feedback I will detail the logic later."
--   "every KPI has a Monthly or Quarterly - If quarterly, then it should give a
--    cumulative for the 3 months period. Individual month data is not required
--    there (Can be filled as NA)."
--   "detail the assumptions, Hard Stops in the evidence sheet."
--
-- Three things follow, and this migration is those three things.
--
-- 1. THE PERIOD COMES FROM `frequency`, NOT FROM THE CALC KEY. A monthly
--    objective is measured over its month; a quarterly one over its whole
--    quarter, and only in the quarter's LAST month -- which is where the
--    workbook already puts it (March and June carry Q1 and Q2; the other ten
--    cells are blank). The other months are NA, and NA is NULL: a zero there
--    would drag a total down and is a different claim entirely.
--
--    CUMULATIVE MEANS POOLED, NOT AVERAGED. A quarter's rate is the three
--    months' numerators over the three months' denominators -- ONE fraction
--    over the whole window -- not the mean of three monthly rates. Averaging
--    rates gives a month with four calls the same weight as a month with
--    ninety, which is how a bad quarter comes out looking ordinary. Because
--    the window is simply widened, the same query answers both frequencies and
--    there is no second code path to keep in step.
--
-- 2. AN OBJECTIVE NAMES ITS REGISTER. Preventive Maintenance and Installation
--    calls live in their own tables (the 0040 split), so `calc_params.family`
--    names one -- field / pm / installation -- and the objective reads exactly
--    the rows that register shows, which is what "Preventive Maintenance Calls"
--    means to the person reading it.
--
--    An `ilike` on `call_type` would in fact have given the same rows: each
--    table carries a CHECK that `call_table_for(call_type)` equals its own
--    name, so a row's type and its table cannot disagree. (Worth stating,
--    because the column DEFAULTS to 'FIELD' in all three tables and the stored
--    spellings run to "P M VISIT", "PM", "INSTALLATION CALL" -- it LOOKS
--    untrustworthy and is not.) Naming the table is preferred for two duller
--    reasons: it reads one register instead of scanning the union of three,
--    and "which register" is the question the objective is actually asking. A
--    `call_type` filter is still honoured on top, so an administrator's own
--    narrowing keeps working.
--
-- 3. THE EVIDENCE STATES ITS ASSUMPTIONS AND ITS HARD STOPS. `objective_notes`
--    returns them as rows, per objective, so the Calculation sheet carries them
--    in words. The distinction is deliberate and worth keeping:
--
--      an ASSUMPTION is a choice that could reasonably have gone another way,
--      and somebody reading the figure is entitled to know it was made --
--      which register, which product pattern, which date the clock runs from.
--
--      a HARD STOP is a rule the figure will not bend: cancelled calls are
--      never counted, a period with no calls yields no rate rather than 0%,
--      the cutoff is never later than today.
--
--    Both are derived from the objective's own calc_key and params, so an
--    objective cannot be re-pointed at a different register while the file
--    goes on describing the old one.
--
-- WHAT IS NOT HERE. "b.Customer feedback" stays typed -- the user is detailing
-- that logic later, and `public.feedback` holds free-form answers with no
-- scoring rule anybody has written down yet. Inventing one would put a number
-- on a quality record that nobody agreed to.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- MONTHLY OR QUARTERLY, from the register's own `frequency` column.
--
-- The workbook writes it "Monthly" and "3 Months"; a person editing the screen
-- may well type "Quarterly". Both are recognised, and anything else is monthly
-- -- the safer default, because a monthly objective that should have been
-- quarterly reports twelve honest figures, whereas the other way round it
-- reports four and silently loses eight.
-- ---------------------------------------------------------------------------
create or replace function public.objective_is_quarterly(p_freq text)
returns boolean language sql immutable as $$
  select coalesce(p_freq, '') ~* '(quarter|3\s*month)';
$$;
comment on function public.objective_is_quarterly(text) is
  'True for "3 Months" / "Quarterly". Anything unrecognised is monthly -- the safer default: a monthly reading of a quarterly objective still reports every month, the reverse loses eight of them.';

-- ---------------------------------------------------------------------------
-- THE WINDOW ONE FIGURE IS MEASURED OVER.
--
-- Monthly:   the month, ending at its last day or today, whichever is earlier.
-- Quarterly: the whole quarter, reported in its LAST month only -- so March
--            carries Jan-Mar and January carries nothing. `applies` is false
--            for the other two months, and Re-Calc leaves them NA.
--
-- The end is `objective_cutoff`, unchanged: never later than today, so July's
-- figure is what was true at the end of July and does not drift as calls are
-- closed in September.
-- ---------------------------------------------------------------------------
-- The return type has widened since (0137 adds solve_cutoff and cutoff_note),
-- and `create or replace function` CANNOT change one -- replaying this file
-- onto a database already carrying the later shape would fail outright. So it
-- is DROPPED first: a file must be runnable on a database in any state.
drop function if exists public.objective_period(bigint, integer);
create function public.objective_period(p_id bigint, p_month integer)
returns table (applies boolean, period_start date, period_end date, label text)
language plpgsql stable security definer set search_path = public as $$
declare
  o        public.quality_objectives;
  cutoff   date;
  q_first  integer;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found then return; end if;
  if p_month < 1 or p_month > 12 then return; end if;

  cutoff := public.objective_cutoff(o.year, p_month);

  -- The month has not been reached at all: nothing to measure, either way.
  if cutoff < make_date(o.year, p_month, 1) then
    applies := false; period_start := null; period_end := null; label := '';
    return next; return;
  end if;

  if public.objective_is_quarterly(o.frequency) then
    if p_month % 3 <> 0 then
      applies := false; period_start := null; period_end := null;
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
    return next; return;
  end if;

  applies      := true;
  period_start := make_date(o.year, p_month, 1);
  period_end   := cutoff;
  label        := to_char(make_date(o.year, p_month, 1), 'Mon') || ' ' || o.year;
  return next;
end $$;
revoke all on function public.objective_period(bigint, integer) from public;
grant execute on function public.objective_period(bigint, integer) to authenticated;

comment on function public.objective_period(bigint, integer) is
  'The window one figure is measured over, from the objective''s frequency. Monthly = the month; quarterly = the whole quarter, reported in its last month only (applies is false for the other two, which stay NA). The end is never later than today.';

-- ---------------------------------------------------------------------------
-- WHICH REGISTER an objective counts. `calc_params.family` names it; with none
-- named the objective counts EVERY register through the `calls` union view,
-- and the notes say which was read either way, so a mis-set family shows up in
-- the evidence rather than in a plausible wrong number.
-- ---------------------------------------------------------------------------
create or replace function public.objective_call_table(p_params jsonb)
returns text language sql immutable as $$
  select case lower(btrim(coalesce(p_params->>'family', '')))
           when 'field'        then 'public.field_calls'
           when 'pm'           then 'public.pm_calls'
           when 'install'      then 'public.installation_calls'
           when 'installation' then 'public.installation_calls'
           else                     'public.calls'
         end;
$$;
comment on function public.objective_call_table(jsonb) is
  'The call register an objective reads, from calc_params.family. PM and Installation calls live in their own tables (0040); each table CHECKs that call_table_for(call_type) matches it, so naming the table and filtering on call_type agree -- the table is named because it reads one register rather than the union of three.';

create or replace function public.objective_register_name(p_params jsonb)
returns text language sql immutable as $$
  select case public.objective_call_table(p_params)
           when 'public.field_calls'        then 'Field calls'
           when 'public.pm_calls'           then 'Preventive Maintenance calls'
           when 'public.installation_calls' then 'Installation calls'
           else                                  'every call register (Field, PM and Installation)'
         end;
$$;

-- ---------------------------------------------------------------------------
-- THE FIGURE, over the objective's own period.
--
-- open_rate_monthly  -- the key is unchanged so an already-seeded objective
--                       keeps working, but the window is now the FREQUENCY's,
--                       not always a month. Calls registered in the period by
--                       REGISTRATION DATE, less those solved by its end.
-- attended_within_days -- of the calls registered in the period, the share
--                       attended within N days. Attended is the EARLIER of the
--                       first visit and the first spare request, exactly as the
--                       KPI export computes it, so the two artifacts agree.
-- failure_rate_12m   -- unchanged: the trailing twelve months to the cutoff
--                       over the machines in Product Master. A failure rate is
--                       a rolling window by definition, so a quarterly one is
--                       still twelve months, reported once a quarter.
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
                  and r.updated_at::date <= $2))
        from %s c
       where c.cancelled_at is null
         and c.call_type ilike $3
         and c.reg_date >= $1 and c.reg_date <= $2
    $q$, public.objective_call_table(o.calc_params))
      into n_den, n_num
     using p.period_start, p.period_end,
           coalesce(nullif(btrim(o.calc_params->>'call_type'), ''), '%');
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
-- THE ASSUMPTIONS AND THE HARD STOPS, in words, per objective.
--
-- An ASSUMPTION could have gone another way and somebody is entitled to know
-- it was made. A HARD STOP is a rule the figure will not bend. Keeping them
-- apart is the point: a reader who disagrees with an assumption can change it
-- on the screen, whereas a hard stop is what the number MEANS and changing it
-- would make it a different number.
--
-- Derived from the objective's own calc_key and params, so an objective cannot
-- be re-pointed at another register while the file describes the old one.
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
            'it was attended or solved.';
    return next;
  end if;

  if o.calc_key = 'open_rate_monthly' then
    note := 'A call counts as CLOSED once any visit records a status beginning "Solved" '
            '-- so "Solved - Report Pending" is closed, per the sheet.';
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
  note := 'The period ends ' || coalesce(p.period_end::text, 'when the month is reached')
          || ' -- the last day of the period or TODAY, whichever is earlier. An earlier '
          'month''s figure does not drift as calls are closed later.';
  return next;
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

comment on function public.objective_notes(bigint, integer) is
  'The assumptions and hard stops behind one figure, in words, for the evidence workbook''s Calculation sheet. An ASSUMPTION could have gone another way and is editable on the screen; a HARD STOP is what the number means. Derived from the objective''s own calc_key and params, so it cannot describe a register the objective no longer reads.';

-- ---------------------------------------------------------------------------
-- RE-CALC, over periods rather than months.
--
-- The one addition: for a COMPUTED quarterly objective, the ten months that
-- are not quarter-ends are CLEARED to NA. Re-Calc owns the figures of an
-- objective it computes, and a stale monthly number left sitting in February
-- beside a Q1 figure in March is exactly the kind of thing an auditor stops
-- on. A TYPED objective is still never touched -- quarterly or not.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_quality_objectives(p_year integer)
returns table (objective text, months_written integer)
language plpgsql security definer set search_path = public as $$
declare
  o   public.quality_objectives;
  p   record;
  m   integer;
  v   numeric;
  n   integer;
begin
  if not public.has_perm('config.manage') then
    raise exception 'RBAC: only an administrator can re-calculate the objectives';
  end if;

  for o in select * from public.quality_objectives
            where year = p_year and calc_key <> '' order by sort_order loop
    n := 0;
    for m in 1..12 loop
      select * into p from public.objective_period(o.id, m);
      if found and p.applies then
        v := public.objective_value(o.id, m);
        if v is not null then
          execute format('update public.quality_objectives set %I = $1 where id = $2',
                         'm' || lpad(m::text, 2, '0'))
            using v, o.id;
          n := n + 1;
        end if;
      elsif found and public.objective_is_quarterly(o.frequency) then
        -- Not a quarter-end month: NA, and NA is NULL. Only for an objective
        -- this function computes -- a typed one keeps whatever is in it.
        execute format('update public.quality_objectives set %I = null where id = $1',
                       'm' || lpad(m::text, 2, '0'))
          using o.id;
      end if;
    end loop;
    objective := o.parameter; months_written := n;
    return next;
  end loop;
end $$;
revoke all on function public.recalc_quality_objectives(integer) from public;
grant execute on function public.recalc_quality_objectives(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- THE OBJECTIVES THIS ROUND AUTOMATES.
--
-- 8, 9 and 10 are one formula over three registers: calls registered in the
-- period, less those solved by its end. 8 is monthly; 9 and 10 are quarterly
-- and the frequency column already says so, so nothing here has to know that.
--
-- 11 is seeded too, with the boundary and the clock STATED in the evidence
-- rather than buried: "within 3 days" is read as an attended-in-days of 3 or
-- less, and changing that reading is one number on the screen.
--
-- 12 (Customer feedback) is deliberately NOT seeded. The user is detailing that
-- logic, and public.feedback holds free-form answers with no scoring rule
-- written down. A number nobody agreed to is worse on a quality record than a
-- blank one.
--
-- Each update is guarded on calc_key = '' so it never overrides an
-- administrator who has already pointed the objective somewhere else.
-- ---------------------------------------------------------------------------
update public.quality_objectives
   set calc_key = 'open_rate_monthly',
       calc_params = jsonb_build_object('family', f.family)
  from (values
    ('Breakdown Calls',                 'field'),
    ('Preventive Maintenance Calls',    'pm'),
    ('Installation call',               'installation')
  ) as f(parameter, family)
 where quality_objectives.year = 2026
   and lower(btrim(quality_objectives.parameter)) = lower(btrim(f.parameter))
   and quality_objectives.calc_key = '';

-- Breakdown Calls was seeded in 0132 with {"call_type":"FIELD"} against
-- field_calls. Same rows, but the family says it in the register's own terms
-- and the notes can then name the register. Guarded so it only moves a params
-- object that is still exactly the one 0132 wrote.
update public.quality_objectives
   set calc_params = jsonb_build_object('family', 'field')
 where year = 2026
   and lower(btrim(parameter)) = 'breakdown calls'
   and calc_key = 'open_rate_monthly'
   and calc_params = jsonb_build_object('call_type', 'FIELD');

update public.quality_objectives
   set calc_key = 'attended_within_days',
       calc_params = jsonb_build_object('family', 'field', 'days', 3)
 where year = 2026
   and lower(btrim(parameter)) = 'problem call attending within 3 days'
   and calc_key = '';

-- ===========================================================================
-- THE EVIDENCE, OVER THE SAME PERIOD AND THE SAME REGISTER.
--
-- This has to move with `objective_value` or the file stops adding up to the
-- number, which is the one promise the evidence makes. Same window, same
-- register, same rule for "solved" -- written once here, twice on purpose
-- nowhere.
--
-- The filter row now names the PERIOD and the REGISTER as well as the product,
-- so a reader can see at a glance that a March figure on a quarterly objective
-- covers January to March.
--
-- The return type is unchanged, so this is a plain `create or replace`.
-- ===========================================================================
-- Widened again in 0137 (the closure date and the cut-off callout), so this
-- one is dropped first for the same reason.
drop function if exists public.objective_evidence(bigint, integer);
create function public.objective_evidence(p_id bigint, p_month integer)
returns table (
  role text, ucn text, call_number text, reg_date date, product_name text,
  serial text, party_name text, call_type text, status text, allocated_to text,
  warranty_number text, warranty_start date, warranty_end date,
  contract_number text, contract_start date, contract_end date, contract_type text
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
             c.contract_number, c.contract_start, c.contract_end, c.contract_type
        from public.field_calls c
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
             ''::text, null::date, null::date, ''::text, null::date, null::date, ''::text;
    return query
      select 'machine'::text, ''::text, ''::text, null::date,
             pr.item_name, pr.serial_number, pr.party_name, ''::text,
             coalesce(pr.item_status, ''), ''::text,
             pr.warranty_number, pr.warranty_start, pr.warranty_end,
             pr.contract_number, pr.contract_start, pr.contract_end, pr.contract_type
        from public.products pr
       where pr.item_name ilike v_prod
         and coalesce(pr.serial_number, '') ilike v_serial
       order by pr.serial_number;
    return;
  end if;

  if o.calc_key = 'open_rate_monthly' then
    -- SHEET 1 -- every call registered in the PERIOD (the denominator), each
    -- labelled open or closed at its end (the numerator). Both halves in one
    -- list, countable either way.
    return query execute format($q$
      select case when not exists (
                    select 1 from public.reports r
                     where r.ucn = c.ucn
                       and r.call_status ilike 'solved%%'
                       and r.updated_at::date <= $2)
                  then 'open' else 'closed' end,
             c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type
        from %s c
       where c.cancelled_at is null
         and c.call_type ilike $3
         and c.reg_date >= $1 and c.reg_date <= $2
       order by c.reg_date
    $q$, public.objective_call_table(o.calc_params))
      using p.period_start, p.period_end, v_type;
    -- No install base: this rate is calls over calls, and the sheet says so
    -- rather than being left empty, because an empty sheet reads as a fault.
    return;
  end if;

  if o.calc_key = 'attended_within_days' then
    v_days := coalesce((o.calc_params->>'days')::integer, 3);
    -- SHEET 1 -- every call registered in the period, labelled by whether it
    -- was attended inside the limit. 'late' covers a call attended after the
    -- limit AND one never attended at all: both fail the objective, and the
    -- status column tells them apart.
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
             c.contract_number, c.contract_start, c.contract_end, c.contract_type
        from c left join fv on fv.ucn = c.ucn left join fs on fs.ucn = c.ucn
       order by c.reg_date
    $q$, public.objective_call_table(o.calc_params))
      using p.period_start, p.period_end, v_type, v_days;
    return;
  end if;
end $$;
revoke all on function public.objective_evidence(bigint, integer) from public;
grant execute on function public.objective_evidence(bigint, integer) to authenticated;

comment on function public.objective_evidence(bigint, integer) is
  'The rows behind one objective in one period -- the objective''s frequency decides whether that is a month or a whole quarter. Calls come from the register calc_params.family names; a rate also returns a role=filter row and the Product Master machines it selected. Same window and same register as objective_value, so the figure and its working cannot disagree.';
