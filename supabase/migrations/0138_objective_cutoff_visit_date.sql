-- ===========================================================================
-- THE CUT-OFF READS THE VISIT DATE, IS SET AT RE-CALC, AND CAN BE LOCKED.
--
-- The user, 2026-09-07:
--   "I want to consider the Visit Date and not the Visit Entry Date. And I want
--    to be able to set that Cut Off Date before Recalculation. If there is no
--    Date set, then it has to take the Default EMONTH. The Set Date overrides
--    always. Every Month, I would give the Objective Data on 8/9th of that
--    Month so I end up considering all the Calls closed as on that day. I
--    understand the Monthly KPI shouldnt be calculated that way, but still the
--    Team is used to this way of Working. So i need to be able to set the Cut
--    Off Date. And as Admin, I would like to Enable / Disable changing the
--    CutOff Date"
--
-- Four changes, in that order.
--
-- 1. THE VISIT DATE, NOT THE ENTRY DATE. A call is closed when the ENGINEER
--    ATTENDED it, not when somebody typed the report up. 0137 put both dates on
--    the sheet precisely so this could be decided by looking rather than
--    arguing; it has been, and the rule moves.
--
--    This CHANGES FIGURES, deliberately: a visit on 30 May entered on 3 June is
--    now closed in May. Every such call is the one the export was flagging.
--
--    A solving report with NO visit date recorded falls back to the date it was
--    entered. That is a deliberate, stated fallback rather than a silent one:
--    treating a blank field as "never solved" would move a genuinely closed
--    call into the open column on the strength of a missing keystroke, and the
--    figure would get WORSE for a data-entry lapse. The evidence marks it.
--
-- 2. THE CUT-OFF IS SET AT RE-CALCULATE. `recalc_quality_objectives` takes an
--    optional date. Given one, it STORES it on every objective it is about to
--    compute -- so the figure and the setting behind it can never disagree, and
--    the evidence file, the notes and the page all read the one stored value
--    rather than a date that lived only inside one run.
--
--    Given NO date it changes nothing: whatever is stored still applies, and
--    where nothing is stored the cut-off is the period's own end -- the
--    "Default EMONTH". A set date overrides always, which is why storing it is
--    the right shape: an override that vanished when the dialog closed would
--    not be an override.
--
--    IT APPLIES TO EVERY MONTH THE RUN WRITES, which is what "considering all
--    the Calls closed as on that day" asks for, and is worth stating plainly:
--    re-calculating in October with 09-Oct also re-reads January as at 09-Oct.
--    The user has said the team works this way and that they know a monthly KPI
--    is not strictly measured like that. The honest engineering answer is not
--    to refuse it but to make it VISIBLE -- so the cut-off is stored on the
--    objective, shown on the page, and named in the evidence. A figure computed
--    generously is defensible; one that moved without saying so is not.
--
-- 3. AN ADMIN CAN LOCK IT. `objective_cutoff_locked` in app_settings, the same
--    shape as Audit Mode (0114): a read anybody may call, and one admin-only
--    setter. Locked, the cut-off cannot be changed -- not through Re-Calculate,
--    and not by editing calc_params on the objective either, because a lock the
--    JSON box walks around is decoration. Enforced by a TRIGGER, so it holds
--    for anything that reaches the table.
--
--    An ADMINISTRATOR is not blocked by it. The lock exists to stop the figure
--    being re-based by whoever else holds config.manage; the admin is the
--    person who set it, and locking them out of their own switch only teaches
--    them to leave it off.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 3a. THE LOCK. app_settings is created by 0047; guarded so this file replays
-- on a project where that has not run yet.
-- ---------------------------------------------------------------------------
do $lock$
begin
  if to_regclass('public.app_settings') is null then
    raise notice 'app_settings is missing -- run 0047_audit_retention_compliance.sql first';
    return;
  end if;
  insert into public.app_settings (key, value) values ('objective_cutoff_locked', 'off')
    on conflict (key) do nothing;
end $lock$;

create or replace function public.objective_cutoff_locked()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select lower(btrim(value)) in ('on', 'true', '1', 'yes')
       from public.app_settings where key = 'objective_cutoff_locked'),
    false)
$$;
revoke all on function public.objective_cutoff_locked() from public;
grant execute on function public.objective_cutoff_locked() to authenticated;
comment on function public.objective_cutoff_locked() is
  'True when the objective cut-off date is locked. Off by default: a lock nobody asked for that quietly refuses an edit is worse than no lock.';

create or replace function public.set_objective_cutoff_lock(p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'RBAC: only an administrator can lock or unlock the objective cut-off';
  end if;
  insert into public.app_settings (key, value, updated_at)
       values ('objective_cutoff_locked', case when p_on then 'on' else 'off' end, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return p_on;
end $$;
revoke all on function public.set_objective_cutoff_lock(boolean) from public;
grant execute on function public.set_objective_cutoff_lock(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. THE LOCK, ENFORCED AT THE TABLE.
--
-- A lock the JSON box on the definition screen can walk around is decoration.
-- This fires on any UPDATE that changes either cut-off key, whatever wrote it.
-- ---------------------------------------------------------------------------
create or replace function public.quality_objectives_cutoff_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.objective_cutoff_locked() then return new; end if;
  if public.is_admin() then return new; end if;
  if (old.calc_params->>'cutoff_date') is distinct from (new.calc_params->>'cutoff_date')
     or (old.calc_params->>'cutoff_days') is distinct from (new.calc_params->>'cutoff_days') then
    raise exception 'The objective cut-off is locked. An administrator can unlock it on the Objective page.';
  end if;
  return new;
end $$;
drop trigger if exists zz_quality_objectives_cutoff_guard on public.quality_objectives;
create trigger zz_quality_objectives_cutoff_guard
  before update on public.quality_objectives
  for each row execute function public.quality_objectives_cutoff_guard();

-- ---------------------------------------------------------------------------
-- 1. THE FIGURE, closing on the VISIT DATE.
--
-- Only the open-rate moves. The failure rate counts registrations, and
-- attended-within-days already reads visit dates.
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

  return null;
end $$;
revoke all on function public.objective_value(bigint, integer) from public;
grant execute on function public.objective_value(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- THE EVIDENCE, closing on the same date -- and saying when it had to fall
-- back, so a blank visit date is visible rather than quietly assumed.
-- ---------------------------------------------------------------------------
create or replace function public.objective_evidence(p_id bigint, p_month integer)
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
    -- The closing report is the EARLIEST solving one by the date that counts,
    -- so the row shown is the row the figure used.
    return query execute format($q$
      select case when cl.counts_on is not null and cl.counts_on <= $4
                  then 'closed' else 'open' end,
             c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type,
             cl.closed_on, cl.recorded_on,
             -- BOTH facts, not the first one that matches: a call can be
             -- excluded by the cut-off AND be missing its visit date, and
             -- whoever reads the row needs to know each of those separately.
             concat_ws(' ',
               case when cl.counts_on is not null and cl.counts_on > $4
                    then 'YES -- solved on ' || cl.counts_on
                         || ', after the cut-off of ' || $4 || ', so it is counted as OPEN'
               end,
               case when cl.counts_on is not null and cl.closed_on is null
                    then 'NOTE -- no visit date on the solving report; the date it was '
                         'ENTERED (' || cl.recorded_on || ') was used instead'
               end)
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
             cl.closed_on, cl.recorded_on, ''::text
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
end $$;
revoke all on function public.objective_evidence(bigint, integer) from public;
grant execute on function public.objective_evidence(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RE-CALCULATE, taking the cut-off.
--
-- The date is STORED on each objective it computes, not held for the run: a
-- figure and the setting behind it must not be able to disagree, and the
-- evidence file has to be able to say what was applied months later.
--
-- The 1-argument form is dropped -- leaving both would make
-- `recalc_quality_objectives(2026)` ambiguous.
-- ---------------------------------------------------------------------------
drop function if exists public.recalc_quality_objectives(integer);
drop function if exists public.recalc_quality_objectives(integer, date);

create function public.recalc_quality_objectives(p_year integer, p_cutoff date default null)
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
  if p_cutoff is not null
     and public.objective_cutoff_locked() and not public.is_admin() then
    raise exception 'The objective cut-off is locked. An administrator can unlock it on the Objective page.';
  end if;

  -- The cut-off is stored BEFORE anything is computed, so every figure this run
  -- writes was measured under the date the objective now says it was. Only the
  -- open-rate objectives take one -- a failure rate counts registrations, and
  -- attended-within-days reads its own dates.
  if p_cutoff is not null then
    update public.quality_objectives
       set calc_params = (calc_params - 'cutoff_days')
                         || jsonb_build_object('cutoff_date', p_cutoff::text)
     where year = p_year and calc_key = 'open_rate_monthly';
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
        execute format('update public.quality_objectives set %I = null where id = $1',
                       'm' || lpad(m::text, 2, '0'))
          using o.id;
      end if;
    end loop;
    objective := o.parameter; months_written := n;
    return next;
  end loop;
end $$;
revoke all on function public.recalc_quality_objectives(integer, date) from public;
grant execute on function public.recalc_quality_objectives(integer, date) to authenticated;

comment on function public.recalc_quality_objectives(integer, date) is
  'Re-calculates the computed objectives for a year. A cut-off date is STORED on every open-rate objective before anything is computed, so the figure and the setting behind it cannot disagree; passing none leaves whatever is stored in place, and where nothing is stored the cut-off is the period end. It applies to EVERY month the run writes -- re-calculating in October with 09-Oct also re-reads January as at 09-Oct.';

-- ---------------------------------------------------------------------------
-- THE NOTES, saying which date closes a call.
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
    note := 'A CUT-OFF IS NEVER LATER THAN TODAY, whatever is set on the objective. A '
            'future cut-off would count a period the record cannot yet know about, and '
            'it can only ever move a call from open to closed -- so it would flatter '
            'the figure, which is the direction nobody questions.';
    return next;
    note := 'A CUT-OFF SET AT RE-CALCULATE APPLIES TO EVERY MONTH THAT RUN WRITES, not '
            'only the current one -- re-calculating in October with 09-Oct also re-reads '
            'January as at 09-Oct. That is the reporting practice this was asked for; '
            'it is stored on the objective and named here so the figure says how it was '
            'reached.';
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
