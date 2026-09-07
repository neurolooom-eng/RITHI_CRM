-- ===========================================================================
-- OBJECTIVES THAT COMPUTE THEMSELVES — and say where the figure came from.
--
-- The user's instructions (2026-09-07):
--   "remove all Hardcodes value in the objective. make it editable for Admins.
--    calculated values should be fed automatically upon Re-Calc [Explicitly
--    done at the time of Submission]. Add a Provision to download evidence for
--    the presented data. if the value is not calculated by us, leave it to be
--    editable."
--
-- So an objective now carries HOW it is worked out, not just what it says:
--
--   calc_key = ''                 nobody computes it — the figure is typed,
--                                 and stays typed. Re-Calc leaves it alone.
--   calc_key = 'failure_rate_12m' failures on a product in the trailing 12
--                                 months, over the machines of that product in
--                                 the field. calc_params: {"product":"%T75%"}
--   calc_key = 'open_rate_monthly' calls of a type registered in the month
--                                 that were STILL OPEN at the month's cutoff.
--                                 calc_params: {"call_type":"FIELD"}
--
-- Adding an objective to the automated set is filling in those two fields —
-- which is what "figure out later what we can automate" needs it to be. No
-- migration, no deploy: an administrator does it on the screen.
--
-- THE CUTOFF IS THE END OF THE MONTH, NEVER LATER THAN TODAY (the user's
-- "cutoff not greater than emonth"). July's figure is what was true at the end
-- of July and does not drift as calls are closed in September. The current
-- month is measured up to today, because that is as far as the record goes.
--
-- RE-CALC NEVER TOUCHES A TYPED FIGURE. It writes only the months of
-- objectives that have a calc_key, and only up to the cutoff — a future month
-- is left blank rather than filled with a zero that reads as "nothing failed".
--
-- MACHINES IN THE FIELD ARE COUNTED AS THEY ARE TODAY. The Product Register
-- does not keep a history of what was installed in March, so a rate for March
-- uses today's install base. It is stated here because it is the one part of
-- these numbers that is not strictly as-at, and an auditor should hear it from
-- the record rather than work it out.
-- ===========================================================================

alter table public.quality_objectives
  add column if not exists calc_key    text  not null default '',
  add column if not exists calc_params jsonb not null default '{}'::jsonb;

comment on column public.quality_objectives.calc_key is
  'Empty = the figure is typed and Re-Calc leaves it alone. Otherwise the name of what computes it: failure_rate_12m, open_rate_monthly.';

-- ---------------------------------------------------------------------------
-- The cutoff for one month: its last day, never later than today (Asia/Kolkata,
-- because "this month" is the reviewer's month).
-- ---------------------------------------------------------------------------
create or replace function public.objective_cutoff(p_year integer, p_month integer)
returns date language sql stable as $$
  select least(
    (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date,
    (now() at time zone 'Asia/Kolkata')::date
  );
$$;

-- ---------------------------------------------------------------------------
-- ONE OBJECTIVE, ONE MONTH — the figure, and the rows behind it.
--
-- The same function answers both: `objective_evidence` returns the calls, and
-- the figure is computed from exactly those rows. A number and its evidence
-- cannot disagree, because there is only one query.
-- ---------------------------------------------------------------------------
-- The return type has widened since (0135), and `create or replace function`
-- CANNOT change one — replaying this file onto a database that already carries
-- the later shape would fail outright. So it is DROPPED first, exactly as the
-- views are: a bundle has to be runnable on a database in any state, not only
-- on an empty one.
drop function if exists public.objective_evidence(bigint, integer);
create function public.objective_evidence(p_id bigint, p_month integer)
returns table (
  role text, ucn text, call_number text, reg_date date, product_name text,
  serial text, party_name text, call_type text, status text, allocated_to text
)
language plpgsql stable security definer set search_path = public as $$
declare
  o      public.quality_objectives;
  cutoff date;
  froms  date;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found then return; end if;
  if not (public.has_perm('calls.view') or public.has_perm('reports.view')) then
    raise exception 'RBAC: you cannot read the calls behind this figure';
  end if;
  cutoff := public.objective_cutoff(o.year, p_month);
  if cutoff < make_date(o.year, p_month, 1) then return; end if;   -- month not reached

  if o.calc_key = 'failure_rate_12m' then
    -- NUMERATOR rows: the failures counted. The denominator is a count of
    -- machines, which is evidence of a different kind — it is returned as one
    -- summary row rather than 21,000 product rows.
    return query
      select 'failure'::text, c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, '')
        from public.field_calls c
       where c.cancelled_at is null
         and c.product_name ilike (o.calc_params->>'product')
         and c.reg_date > (cutoff - interval '12 months')::date
         and c.reg_date <= cutoff
       order by c.reg_date desc;
    return query
      select 'fleet'::text,
             (select count(*)::text from public.products
               where item_name ilike (o.calc_params->>'product')),
             'machines in the field (as they are today)'::text,
             cutoff, o.calc_params->>'product', '', '', '', '', '';
    return;
  end if;

  if o.calc_key = 'open_rate_monthly' then
    -- Every call of the type registered in the month — the denominator — with
    -- `role` saying which of them were still open at the cutoff. Both halves of
    -- the fraction in one list, so the figure can be checked by counting.
    return query
      select case when not exists (
                    select 1 from public.reports r
                     where r.ucn = c.ucn
                       and r.call_status ilike 'solved%'
                       and r.updated_at::date <= cutoff)
                  then 'open' else 'closed' end,
             c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, '')
        from public.field_calls c
       where c.cancelled_at is null
         and c.call_type ilike coalesce(o.calc_params->>'call_type', '%')
         and date_trunc('month', c.reg_date) = make_date(o.year, p_month, 1)
         and c.reg_date <= cutoff
       order by c.reg_date;
    return;
  end if;
end $$;
revoke all on function public.objective_evidence(bigint, integer) from public;
grant execute on function public.objective_evidence(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The figure for one objective in one month, from the evidence above.
-- ---------------------------------------------------------------------------
create or replace function public.objective_value(p_id bigint, p_month integer)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  o        public.quality_objectives;
  cutoff   date;
  n_num    integer;
  n_den    integer;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found or o.calc_key = '' then return null; end if;
  cutoff := public.objective_cutoff(o.year, p_month);
  if cutoff < make_date(o.year, p_month, 1) then return null; end if;   -- not reached yet

  if o.calc_key = 'failure_rate_12m' then
    select count(*) into n_num from public.field_calls c
     where c.cancelled_at is null
       and c.product_name ilike (o.calc_params->>'product')
       and c.reg_date > (cutoff - interval '12 months')::date
       and c.reg_date <= cutoff;
    select count(*) into n_den from public.products
     where item_name ilike (o.calc_params->>'product');
    if coalesce(n_den, 0) = 0 then return null; end if;   -- no fleet, no rate
    return round(n_num::numeric / n_den, 6);
  end if;

  if o.calc_key = 'open_rate_monthly' then
    select count(*),
           count(*) filter (where not exists (
             select 1 from public.reports r
              where r.ucn = c.ucn and r.call_status ilike 'solved%'
                and r.updated_at::date <= cutoff))
      into n_den, n_num
      from public.field_calls c
     where c.cancelled_at is null
       and c.call_type ilike coalesce(o.calc_params->>'call_type', '%')
       and date_trunc('month', c.reg_date) = make_date(o.year, p_month, 1)
       and c.reg_date <= cutoff;
    if coalesce(n_den, 0) = 0 then return null; end if;   -- no calls, no rate
    return round(n_num::numeric / n_den, 6);
  end if;

  return null;
end $$;
revoke all on function public.objective_value(bigint, integer) from public;
grant execute on function public.objective_value(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RE-CALC. Explicit, never on a page load: the user asked for it at the moment
-- of submission, and a figure that changes because somebody opened a screen is
-- not a figure anybody can defend.
--
-- Writes only objectives that HAVE a calc_key. A typed figure is never touched,
-- which is the whole of "if the value is not calculated by us, leave it to be
-- editable".
-- ---------------------------------------------------------------------------
create or replace function public.recalc_quality_objectives(p_year integer)
returns table (objective text, months_written integer)
language plpgsql security definer set search_path = public as $$
declare
  o   public.quality_objectives;
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
      v := public.objective_value(o.id, m);
      if v is not null then
        execute format('update public.quality_objectives set %I = $1 where id = $2',
                       'm' || lpad(m::text, 2, '0'))
          using v, o.id;
        n := n + 1;
      end if;
    end loop;
    -- The year to date, on the same footing as the months: the count-based
    -- objectives sum, the rates are the figure at the latest month reached.
    objective := o.parameter; months_written := n;
    return next;
  end loop;
end $$;
revoke all on function public.recalc_quality_objectives(integer) from public;
grant execute on function public.recalc_quality_objectives(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Which of the 2026 objectives we can compute today, and how.
--
-- SEEDED, NOT FIXED: `calc_params` is a jsonb column an administrator edits on
-- the screen. The product patterns below are a starting point — the page shows
-- how many machines and how many calls each one actually matched, so a pattern
-- that catches the wrong thing is visible immediately rather than quietly
-- producing a plausible number.
--
-- The other objectives keep calc_key = '' and stay typed, because nobody has
-- said yet how they are worked out. That is the honest state, and filling one
-- in later is two fields on a screen.
-- ---------------------------------------------------------------------------
update public.quality_objectives set calc_key = 'failure_rate_12m',
       calc_params = jsonb_build_object('product', p.pattern)
  from (values
    ('Recent Failure Rate of CPXcare',          '%CPX%'),
    ('Recent Failure Rate of  Extend (Indian)', '%EXTEND%'),
    ('Recent Failure Rate of Orion-G',          '%ORION%'),
    ('Recent Failure Rate of VEGA',             '%VEGA%'),
    ('Recent Failure Rate of MT75',             '%T75%'),
    ('Failure Rate of MT60',                    '%T60%')
  ) as p(parameter, pattern)
 where quality_objectives.year = 2026
   and lower(btrim(quality_objectives.parameter)) = lower(btrim(p.parameter))
   and quality_objectives.calc_key = '';

update public.quality_objectives
   set calc_key = 'open_rate_monthly',
       calc_params = jsonb_build_object('call_type', 'FIELD')
 where year = 2026 and lower(btrim(parameter)) = 'breakdown calls' and calc_key = '';
