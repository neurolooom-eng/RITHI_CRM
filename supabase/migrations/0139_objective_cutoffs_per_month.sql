-- ===========================================================================
-- A CUT-OFF DATE PER MONTH -- TWELVE OF THEM, NOT ONE.
--
-- The user, 2026-09-07: "aahh.. Noo.. For each month I want to be able to set a
-- cut off date".
--
-- 0138 read "set the Cut Off Date before Recalculation" as ONE date stored on
-- each objective and applied to every month a run wrote. That is wrong, and the
-- consequence was the thing flagged at the time: re-calculating in October with
-- 09-Oct also re-read January as at 09-Oct, quietly re-basing a figure reported
-- eight months earlier.
--
-- What the practice actually is: "Every Month, I would give the Objective Data
-- on 8/9th of that Month". Each month has ITS OWN reporting day -- September is
-- read as at 09-Oct, August was read as at 09-Sep -- so each month needs its own
-- cut-off, and setting this month's must not touch last month's.
--
-- ONE TABLE, ONE ROW PER MONTH PER YEAR, SHARED BY EVERY OBJECTIVE. Not twelve
-- dates per objective: the cut-off is a property of the REPORTING ROUND, not of
-- any one measure. Twelve objectives times twelve months is a hundred and
-- forty-four dates nobody could keep straight, and every one of them would be
-- the same date anyway.
--
-- A month with NO row measures to the end of its own period -- the Default
-- EMONTH, unchanged. A set date overrides always. Both were already true; what
-- changes is that the setting now has the granularity the practice has.
--
-- STILL NEVER LATER THAN TODAY. A cut-off in the future would count a month the
-- record cannot yet know about, and can only ever move a call from open to
-- closed, so it would flatter the figure.
--
-- WRITTEN ONLY THROUGH set_objective_cutoff(). The table has a read policy and
-- NO write policy at all, so the API cannot reach it -- every change goes
-- through one function that checks the permission and the admin lock together.
-- A lock with two doors is not a lock.
--
-- WHAT 0138 LEAVES BEHIND. `calc_params.cutoff_date` and `cutoff_days` still
-- work and still sit on an objective, below this table in precedence. They were
-- never applied to the live project, so nothing in the field depends on them;
-- they are kept because a blanket grace ("five days after every month") is a
-- reasonable thing to want and it costs nothing to keep honouring. Re-Calculate
-- no longer writes either of them, and the screen no longer offers a single
-- year-wide date -- there is now exactly one place to set a cut-off.
-- ===========================================================================

create table if not exists public.objective_cutoffs (
  year        integer not null,
  month       integer not null check (month between 1 and 12),
  cutoff_date date    not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (year, month)
);

alter table public.objective_cutoffs enable row level security;

-- Readable by anyone who can see the objectives -- a figure whose cut-off is
-- secret is not evidence of anything. There is NO write policy: the only way a
-- row changes is set_objective_cutoff(), which is SECURITY DEFINER and checks
-- both the permission and the lock. That is what makes the lock a lock.
grant select on public.objective_cutoffs to authenticated;
revoke insert, update, delete on public.objective_cutoffs from authenticated;
drop policy if exists oc_read on public.objective_cutoffs;
create policy oc_read on public.objective_cutoffs for select
  using (public.has_perm('calls.view') or public.has_perm('reports.view'));

comment on table public.objective_cutoffs is
  'One cut-off date per month per year, shared by every objective: a call counts as closed if it was VISITED on or before this date. A month with no row measures to the end of its own period. Written only through set_objective_cutoff().';

-- ---------------------------------------------------------------------------
-- SET (or clear) ONE MONTH'S CUT-OFF. Passing null clears it, which is how a
-- month goes back to the Default EMONTH -- there has to be a way back, or the
-- first mistyped date is permanent.
-- ---------------------------------------------------------------------------
create or replace function public.set_objective_cutoff(
  p_year integer, p_month integer, p_date date)
returns date language plpgsql security definer set search_path = public as $$
begin
  -- coalesce, NOT a bare `if not has_perm(...)`. `my_extra_perms()` returns NULL
  -- when there is no signed-in user, which makes has_perm() NULL -- and
  -- `if not NULL` never fires, so the guard would fall THROUGH and the write
  -- would go ahead. Caught by a test whose fixture user did not exist; the
  -- pattern is used in fifteen other migrations and is noted in the backlog.
  -- (Not reachable from the API today: execute is granted to `authenticated`
  -- only. That is a second lock, not a reason to leave the first one open.)
  if not coalesce(public.has_perm('config.manage'), false) then
    raise exception 'RBAC: you cannot change the objective cut-off dates';
  end if;
  if coalesce(public.objective_cutoff_locked(), false)
     and not coalesce(public.is_admin(), false) then
    raise exception 'The objective cut-off is locked. An administrator can unlock it on the Objective page.';
  end if;
  if p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'A cut-off belongs to a month between 1 and 12';
  end if;

  if p_date is null then
    delete from public.objective_cutoffs where year = p_year and month = p_month;
    return null;
  end if;

  insert into public.objective_cutoffs (year, month, cutoff_date, updated_by, updated_at)
       values (p_year, p_month, p_date, auth.uid(), now())
  on conflict (year, month) do update
    set cutoff_date = excluded.cutoff_date,
        updated_by  = excluded.updated_by,
        updated_at  = excluded.updated_at;
  return p_date;
end $$;
revoke all on function public.set_objective_cutoff(integer, integer, date) from public;
grant execute on function public.set_objective_cutoff(integer, integer, date) to authenticated;

comment on function public.set_objective_cutoff(integer, integer, date) is
  'Sets one month''s cut-off date, or clears it with null so the month returns to the end of its own period. The only way objective_cutoffs changes -- it checks config.manage and the admin lock together, so the lock has one door.';

-- ---------------------------------------------------------------------------
-- THE WINDOW AND THE CUT-OFF, with the per-month date at the top.
--
-- Precedence, most specific first:
--   1. objective_cutoffs for (year, month)   -- the reporting round's own date
--   2. calc_params.cutoff_date               -- one fixed date on this objective
--   3. calc_params.cutoff_days               -- a blanket grace after the period
--   4. the period's own end                  -- the Default EMONTH
--
-- A QUARTERLY objective reports in its quarter-end month, so it reads THAT
-- month's cut-off -- March carries Jan-Mar and takes March's date.
--
-- The signature is unchanged, but a table type cannot be replaced in place, so
-- it is dropped and recreated.
-- ---------------------------------------------------------------------------
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
  v_month  date;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found then return; end if;
  if p_month < 1 or p_month > 12 then return; end if;

  cutoff := public.objective_cutoff(o.year, p_month);

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

  -- ---- the solve cut-off, most specific setting first ----------------------
  select oc.cutoff_date into v_date
    from public.objective_cutoffs oc
   where oc.year = o.year and oc.month = p_month;
  v_month := make_date(o.year, p_month, 1);

  if v_date is not null then
    solve_cutoff := least(v_date, today);
    cutoff_note  := 'Solved by ' || solve_cutoff || ' -- the cut-off set for '
                    || to_char(v_month, 'Mon YYYY')
                    || case when v_date > today
                            then ', capped at today: the record cannot yet know about a later visit'
                            else '' end || '.';
    return next; return;
  end if;

  v_date := nullif(btrim(coalesce(o.calc_params->>'cutoff_date', '')), '')::date;
  v_days := nullif(btrim(coalesce(o.calc_params->>'cutoff_days', '')), '')::integer;

  if v_date is not null then
    solve_cutoff := least(v_date, today);
    cutoff_note  := 'Solved by ' || solve_cutoff
                    || ' (a fixed cut-off date set on this objective; no cut-off is set for '
                    || to_char(v_month, 'Mon YYYY') || ')'
                    || case when v_date > today then ', capped at today' else '' end || '.';
  elsif v_days is not null and v_days <> 0 then
    solve_cutoff := least((period_end + v_days)::date, today);
    cutoff_note  := 'Solved by ' || solve_cutoff || ' -- ' || v_days
                    || ' day(s) after the period ended, the blanket grace set on this objective'
                    || case when (period_end + v_days)::date > today
                            then ', capped at today' else '' end || '.';
  else
    solve_cutoff := period_end;
    cutoff_note  := 'Solved by ' || solve_cutoff
                    || ' -- the end of the period. No cut-off is set for '
                    || to_char(v_month, 'Mon YYYY') || '.';
  end if;

  return next;
end $$;
revoke all on function public.objective_period(bigint, integer) from public;
grant execute on function public.objective_period(bigint, integer) to authenticated;

comment on function public.objective_period(bigint, integer) is
  'The window one figure is measured over, and the date a solve must be VISITED by. period_start..period_end is the REGISTRATION window and never moves. solve_cutoff comes from objective_cutoffs for that month, else the objective''s own cutoff_date, else its cutoff_days grace, else the period end. Always capped at today.';

-- ---------------------------------------------------------------------------
-- RE-CALCULATE, back to one argument.
--
-- A cut-off is now set per month, in one place, so a date passed to Re-Calculate
-- would be a SECOND way to set one -- and two ways to set the same thing is how
-- a figure ends up disagreeing with the setting that supposedly produced it.
-- Re-Calculate reads; setting is its own act.
-- ---------------------------------------------------------------------------
drop function if exists public.recalc_quality_objectives(integer, date);
drop function if exists public.recalc_quality_objectives(integer);

create function public.recalc_quality_objectives(p_year integer)
returns table (objective text, months_written integer)
language plpgsql security definer set search_path = public as $$
declare
  o   public.quality_objectives;
  p   record;
  m   integer;
  v   numeric;
  n   integer;
begin
  if not coalesce(public.has_perm('config.manage'), false) then
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

comment on function public.recalc_quality_objectives(integer) is
  'Re-calculates the computed objectives for a year, reading each month''s cut-off from objective_cutoffs. It does not SET a cut-off -- set_objective_cutoff() is the one place that does, so a figure cannot disagree with the setting that produced it.';

-- ---------------------------------------------------------------------------
-- THE NOTES: name the month's own cut-off, and drop the year-wide warning that
-- 0138 needed and this does not.
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
