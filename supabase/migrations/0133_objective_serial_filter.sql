-- ===========================================================================
-- "Indian Extend are the Extend XT with serial numbers starting from INXT"
-- (user, 2026-09-07).
--
-- The objective is "Recent Failure Rate of Extend (Indian)", and the register
-- has no column that says Indian: what says it is the SERIAL. So the rate has
-- to narrow on the serial as well as the product, on BOTH halves of the
-- fraction — the failures counted and the machines they are counted against.
--
-- Narrowing only the numerator would be the worse mistake and an easy one to
-- make: Indian failures over the whole Extend fleet reads LOWER than the truth,
-- and a failure rate that flatters itself is the one nobody questions.
--
-- `serial` is optional. An objective without it behaves exactly as before, so
-- the other five product rates are untouched.
-- ===========================================================================

create or replace function public.objective_value(p_id bigint, p_month integer)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  o        public.quality_objectives;
  cutoff   date;
  n_num    integer;
  n_den    integer;
  v_serial text;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found or o.calc_key = '' then return null; end if;
  cutoff := public.objective_cutoff(o.year, p_month);
  if cutoff < make_date(o.year, p_month, 1) then return null; end if;

  if o.calc_key = 'failure_rate_12m' then
    -- '%' when the objective names no serial, so the filter is a no-op rather
    -- than a special case in two places.
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');
    select count(*) into n_num from public.field_calls c
     where c.cancelled_at is null
       and c.product_name ilike (o.calc_params->>'product')
       and coalesce(c.serial, '') ilike v_serial
       and c.reg_date > (cutoff - interval '12 months')::date
       and c.reg_date <= cutoff;
    select count(*) into n_den from public.products
     where item_name ilike (o.calc_params->>'product')
       and coalesce(serial_number, '') ilike v_serial;
    if coalesce(n_den, 0) = 0 then return null; end if;
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
    if coalesce(n_den, 0) = 0 then return null; end if;
    return round(n_num::numeric / n_den, 6);
  end if;

  return null;
end $$;
revoke all on function public.objective_value(bigint, integer) from public;
grant execute on function public.objective_value(bigint, integer) to authenticated;

-- The evidence narrows the same way, or the file would not add up to the
-- figure — which is the one thing it exists to do.
create or replace function public.objective_evidence(p_id bigint, p_month integer)
returns table (
  role text, ucn text, call_number text, reg_date date, product_name text,
  serial text, party_name text, call_type text, status text, allocated_to text
)
language plpgsql stable security definer set search_path = public as $$
declare
  o        public.quality_objectives;
  cutoff   date;
  v_serial text;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found then return; end if;
  if not (public.has_perm('calls.view') or public.has_perm('reports.view')) then
    raise exception 'RBAC: you cannot read the calls behind this figure';
  end if;
  cutoff := public.objective_cutoff(o.year, p_month);
  if cutoff < make_date(o.year, p_month, 1) then return; end if;

  if o.calc_key = 'failure_rate_12m' then
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');
    return query
      select 'failure'::text, c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, '')
        from public.field_calls c
       where c.cancelled_at is null
         and c.product_name ilike (o.calc_params->>'product')
         and coalesce(c.serial, '') ilike v_serial
         and c.reg_date > (cutoff - interval '12 months')::date
         and c.reg_date <= cutoff
       order by c.reg_date desc;
    return query
      select 'fleet'::text,
             (select count(*)::text from public.products
               where item_name ilike (o.calc_params->>'product')
                 and coalesce(serial_number, '') ilike v_serial),
             'machines in the field (as they are today)'::text,
             cutoff,
             (o.calc_params->>'product') || case when v_serial = '%' then '' else ' · serial ' || v_serial end,
             '', '', '', '', '';
    return;
  end if;

  if o.calc_key = 'open_rate_monthly' then
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

-- The Indian Extend, per the user. The other five rates are left alone.
update public.quality_objectives
   set calc_params = calc_params || jsonb_build_object('serial', 'INXT%')
 where year = 2026
   and calc_key = 'failure_rate_12m'
   and parameter ilike '%extend%'
   and not (calc_params ? 'serial');
