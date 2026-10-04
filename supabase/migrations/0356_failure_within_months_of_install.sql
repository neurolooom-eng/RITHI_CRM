-- ===========================================================================
-- PRODUCT FAILURE RATE = FAILURE WITHIN 3 MONTHS OF INSTALLATION, MEASURED
-- OVER A ROLLING 12 MONTHS — and both numbers are set on a page.
--
-- The user, 2026-10-04: "For Product Failures, The Concept is - Failure Within
-- 3 Months, But a Rolling Average for 12 Months - Add this to a Page under
-- Admin, Call the page - SLA / Objective Configuration". Asked and answered the
-- same day:
--   * 3 months from WARRANTY START -- the date this system already treats as
--     the installation date (0141's Reliability template, the FFR);
--   * the rate is over the MACHINES INSTALLED in the rolling window -- of the
--     machines of that product whose warranty started in the 12 months to the
--     cut-off, the share that had a field call within 3 months of it;
--   * it REPLACES what `failure_rate_12m` measured (every field call in 12
--     months over the whole install base), for every objective computed by it;
--   * the page also takes the SLA Targets, which leave Admin Config.
--
-- WHAT CHANGES IN THE FIGURE, said plainly because it is a quality record:
--   NUMERATOR   was every field call on the product in the 12 months;
--               is the MACHINES installed in the window with at least one field
--               call registered on or after their warranty start and no later
--               than <window> months after it (and not after the cut-off).
--               A machine with three such calls is ONE failure.
--   DENOMINATOR was every machine of the product in Product Master, today;
--               is the machines of the product whose WARRANTY START falls in
--               the rolling window. A machine with no warranty start cannot be
--               placed in any window and is in neither number.
--   A call is tied to a machine by SERIAL (trimmed, case-blind) and by the same
--   product pattern on both sides -- the serial alone is not unique (eleven
--   machines share 219).
--
-- MONTHS ALREADY WRITTEN ARE NOT REWRITTEN BY THIS FILE. They change when
-- somebody presses Re-Calculate, which still keeps a typed override (0349).
--
-- THE TWO NUMBERS ARE SETTINGS, not literals: `objective_settings`, edited on
-- Admin -> SLA / Objective Configuration by a holder of objective.manage (its
-- parent config.manage grants it). A number missing from the table falls back
-- to 3 and 12, so a project that has the functions and not the rows still
-- computes the agreed rule.
-- ===========================================================================

create table if not exists public.objective_settings (
  key        text primary key,
  label      text    not null,
  value      integer not null check (value between 1 and 120),
  unit       text    not null default 'months',
  sort_order integer not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- ON CONFLICT DO NOTHING: re-running must not undo what an administrator set.
insert into public.objective_settings (key, label, value, unit, sort_order) values
  ('failure_window_months',  'Product failure: a field call counts as a failure if it is within this many months of installation (warranty start)', 3, 'months', 1),
  ('failure_rolling_months', 'Product failure: measured over the machines installed in this rolling window, ending at the month''s cut-off', 12, 'months', 2)
on conflict (key) do nothing;

alter table public.objective_settings enable row level security;

-- Readable by anyone signed in: two numbers that say how a published figure is
-- worked out are not a secret, and the Objective page names them.
drop policy if exists os_read on public.objective_settings;
create policy os_read on public.objective_settings for select to authenticated
  using (true);
-- Changed only by whoever may change the objectives themselves. No insert or
-- delete policy: the rows are fixed, and a missing row would silently fall
-- back to the default rather than to what was set.
drop policy if exists os_update on public.objective_settings;
create policy os_update on public.objective_settings for update to authenticated
  using ((select public.has_perm('objective.manage')))
  with check ((select public.has_perm('objective.manage')));

grant select, update on public.objective_settings to authenticated;
revoke all on public.objective_settings from anon;

create or replace function public.objective_settings_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  -- STAMPED, a caller-supplied value discarded (the 0113/0114 rule).
  new.updated_by := auth.uid();
  return new;
end $$;
revoke execute on function public.objective_settings_stamp() from public, anon, authenticated;
drop trigger if exists zz_objective_settings_stamp on public.objective_settings;
create trigger zz_objective_settings_stamp before insert or update on public.objective_settings
  for each row execute function public.objective_settings_stamp();

-- Every change is on the record with its old and new value (URS-159's reason:
-- a figure computed under one rule and read months later under another can
-- only be explained if the change is recorded).
do $on$
begin
  if to_regproc('public.record_audit_fn') is null then
    raise notice '0356: record_audit_fn() is missing -- objective_settings is not audited.';
    return;
  end if;
  drop trigger if exists record_audit_u on public.objective_settings;
  create trigger record_audit_u after update on public.objective_settings
    referencing old table as old_rows new table as new_rows for each statement
    execute function public.record_audit_fn();
end $on$;

-- The value, or the agreed default when the row is missing.
create or replace function public.objective_setting(p_key text, p_default integer)
returns integer language sql stable set search_path = public as $$
  select coalesce((select s.value from public.objective_settings s where s.key = p_key), p_default);
$$;
revoke all on function public.objective_setting(text, integer) from public, anon;
grant execute on function public.objective_setting(text, integer) to authenticated;

-- A table created after 0244 attaches the five system columns itself.
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.objective_settings'::regclass);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- THE PAGE, TO THE ADMIN ROLE ONLY, WITH EVERY ACTION ON IT (the user,
-- 2026-10-04: "By Default Grant Permission to Admin - All Actions, Rest let the
-- Admin Decide through the App"). Every other role is decided on Roles &
-- Permissions -> Administration -> SLA / Objective Configuration. That includes
-- the roles that could open Admin Config, where the SLA Targets used to be:
-- they are NOT carried across, by the user's instruction.
-- MERGED, never overwritten; a role with no stored permissions is left alone.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  if to_regclass('public.app_roles') is null then
    raise notice '0356: app_roles is missing -- run rbac.sql first. The key is not granted.';
    return;
  end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(array['mod:/sla-objective-config', 'config.manage', 'objective.manage'])
             ) u
         ),
         updated_at = now()
   where ar.role = 'admin'
     and jsonb_array_length(ar.permissions) > 0
     and not (ar.permissions @> '["mod:/sla-objective-config","config.manage","objective.manage"]'::jsonb);
  get diagnostics n = row_count;
  raise notice '0356: % of 1 role (admin) given mod:/sla-objective-config and its actions', n;
end $$;

-- ---------------------------------------------------------------------------
-- objective_value, objective_evidence, objective_notes: each is the definition
-- read out of a database built from every migration (pg_get_functiondef --
-- 0142's value and notes, 0251's evidence), with ONLY the failure_rate_12m
-- branch changed. Not re-typed from an older file: that is how two guards here
-- lost rules before. `create or replace` keeps the grants 0142 set.
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
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found or o.calc_key = '' then return null; end if;

  select * into p from public.objective_period(p_id, p_month);
  if not found or not p.applies then return null; end if;

  -- FAILURE WITHIN <window> MONTHS OF INSTALLATION, over the machines installed
  -- in the rolling <rolling> months to the cut-off (0356). Installation is the
  -- WARRANTY START. Counted in MACHINES, so a machine called out three times
  -- inside its window is one failure.
  if o.calc_key = 'failure_rate_12m' then
    v_prod   := o.calc_params->>'product';
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');
    select count(*),
           count(*) filter (where exists (
             select 1 from public.field_calls c
              where c.cancelled_at is null
                and c.product_name ilike v_prod
                and upper(btrim(coalesce(c.serial, ''))) = upper(btrim(pr.serial_number))
                and c.reg_date >= pr.warranty_start
                and c.reg_date <= (pr.warranty_start
                      + make_interval(months => public.objective_setting('failure_window_months', 3)))::date
                and c.reg_date <= p.period_end))
      into n_den, n_num
      from public.products pr
     where pr.item_name ilike v_prod
       and coalesce(pr.serial_number, '') ilike v_serial
       and btrim(coalesce(pr.serial_number, '')) <> ''
       and pr.warranty_start > (p.period_end
             - make_interval(months => public.objective_setting('failure_rolling_months', 12)))::date
       and pr.warranty_start <= p.period_end;
    if coalesce(n_den, 0) = 0 then return null; end if;   -- nothing installed, no rate
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
end $function$

;

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

    -- SHEET 1: ONE ROW PER FAILED MACHINE -- its FIRST field call inside the
    -- window -- so the sheet counts to the numerator. `details` says when the
    -- machine was installed, how many days later it failed, and how many calls
    -- fell inside the window.
    return query
      with base as (
        select pr.*
          from public.products pr
         where pr.item_name ilike v_prod
           and coalesce(pr.serial_number, '') ilike v_serial
           and btrim(coalesce(pr.serial_number, '')) <> ''
           and pr.warranty_start > (p.period_end
                 - make_interval(months => public.objective_setting('failure_rolling_months', 12)))::date
           and pr.warranty_start <= p.period_end
      ),
      hits as (
        select b.id as machine_id, b.warranty_start as installed_on, c.*,
               count(*) over (partition by b.id) as calls_in_window,
               row_number() over (partition by b.id order by c.reg_date, c.ucn) as rn
          from base b
          join public.field_calls c
            on c.cancelled_at is null
           and c.product_name ilike v_prod
           and upper(btrim(coalesce(c.serial, ''))) = upper(btrim(b.serial_number))
           and c.reg_date >= b.warranty_start
           and c.reg_date <= (b.warranty_start
                 + make_interval(months => public.objective_setting('failure_window_months', 3)))::date
           and c.reg_date <= p.period_end
      )
      select 'failure'::text, h.ucn, h.call_number, h.reg_date, h.product_name,
             h.serial, h.party_name, h.call_type,
             coalesce(h.open_state, ''), coalesce(h.allocated_to, ''),
             h.warranty_number, h.warranty_start, h.warranty_end,
             h.contract_number, h.contract_start, h.contract_end, h.contract_type,
             cl.closed_on, cl.recorded_on, ''::text,
             jsonb_build_object(
               'Installed (warranty start)', h.installed_on,
               'Days after installation', (h.reg_date - h.installed_on),
               'Field calls in the window', h.calls_in_window)
        from hits h
        left join lateral (
              select r.visit_at::date as closed_on, r.updated_at::date as recorded_on
                from public.reports r
               where r.ucn = h.ucn and r.call_status ilike 'solved%'
               order by coalesce(r.visit_at::date, r.updated_at::date), r.id limit 1) cl on true
       where h.rn = 1
       order by h.reg_date desc, h.ucn;

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
         and pr.warranty_start > (p.period_end
               - make_interval(months => public.objective_setting('failure_rolling_months', 12)))::date
         and pr.warranty_start <= p.period_end
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
       order by c.reg_date, c.ucn
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
end $function$

;

CREATE OR REPLACE FUNCTION public.objective_notes(p_id bigint, p_month integer)
 RETURNS TABLE(kind text, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    note := 'A machine is INSTALLED on its WARRANTY START. The rate is over the machines '
            'of that product whose warranty started in the '
            || public.objective_setting('failure_rolling_months', 12)
            || ' months ending at the cut-off (Sheet 2); a machine with no warranty start, '
               'or no serial, is in neither number.';
    return next;
    note := 'A machine has FAILED when a field call on its serial was registered on or '
            'after its warranty start and within '
            || public.objective_setting('failure_window_months', 3)
            || ' months of it. It is counted ONCE however many calls it had; Sheet 1 '
               'shows its first, and how many fell inside the window.';
    return next;
    note := 'Both numbers are set on Admin -> SLA / Objective Configuration. A figure '
            'already written keeps the rule it was calculated under until Re-Calculate.';
    return next;
    note := 'Product Master keeps no history, so a machine whose warranty start or serial '
            'has since been corrected is counted as it reads TODAY.';
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
  -- A failure rate is not windowed by REGISTRATION in the period; it says its
  -- own window above, and this line would contradict it (0356).
  if o.calc_key <> 'failure_rate_12m' then
    note := 'Calls are those REGISTERED between '
            || coalesce(p.period_start::text, '(period not reached)') || ' and '
            || coalesce(p.period_end::text, '(period not reached)')
            || ' -- the last day of the period or TODAY, whichever is earlier.';
    return next;
  end if;
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
  note := case when o.calc_key = 'failure_rate_12m'
               then 'A window with NO machines installed gives NO rate -- the cell stays '
                    'blank. It is never written as 0%, which would read as "nothing failed".'
               else 'A period with NO calls gives NO rate -- the cell stays blank. It is never '
                    'written as 0%, which would read as "nothing was open".' end;
  return next;
  note := 'Figures are written ONLY by an explicit Re-Calculate. Nothing on this page '
          'changes because somebody opened it.';
  return next;
  note := 'Re-Calculate never overwrites a TYPED figure, and never writes a month that '
          'has not been reached.';
  return next;

  if o.calc_key = 'failure_rate_12m' then
    note := 'The window is ROLLING and ends at the cut-off: it does not shorten for an '
            'early month. A machine installed shortly before the cut-off has not yet had '
            'its full ' || public.objective_setting('failure_window_months', 3)
            || ' months, so the most recent months read LOWER than they will once those '
               'machines have run their window -- and they will not look wrong. Re-Calculate '
               'a month again later to see it settle.';
    return next;
  end if;
end $function$

;
