-- ===========================================================================
-- THE OBJECTIVE EVIDENCE FILE IS READ IN A FIXED ORDER (finding 15, the rest).
--
--   objective_evidence() is paged by the app (allRows over the RPC, a thousand
--   rows at a time), and every page re-runs the function. Its call branches
--   were ordered by `reg_date` alone -- a date, so ties are certain -- and the
--   machine branch by `serial_number` alone, which is not unique either (eleven
--   machines share the serial 219). Nothing made the order of the tied rows the
--   same from one page to the next, so a row could appear on two pages or on
--   none, in the file somebody checks the Objective's figure AGAINST.
--
--   THE ONLY CHANGE is a tiebreaker on four ORDER BY clauses: the UCN (unique
--   per call table) on the three call branches, and item name + id on the
--   machine branch. The rest of the body is the definition taken from a
--   database built from every migration (pg_get_functiondef, 0142's), word for
--   word -- NOT re-typed from an older file, which is how two guards here lost
--   rules before. The FFR branch already ends in f.id and is untouched.
--
--   `create or replace` keeps the grants 0142 set. _status.sql row 191.
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
       order by c.reg_date desc, c.ucn;

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
end $function$;
