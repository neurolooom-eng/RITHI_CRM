-- ===========================================================================
-- THE INSTALLATION BASE IS A PRODUCT MASTER LISTING, AND SAYS WHAT FILTERED IT.
--
-- "Installation Base has to come from Product Master - Filter Product (For All
-- Products Except Extend XT) And list that in the Installation Base"
-- (user, 2026-09-07).
--
-- It already comes from Product Master (`public.products` IS Product Master),
-- filtered on the PRODUCT, and only the Extend objective carries a serial as
-- well — that being the one product where the serial says which machines count
-- (0133). What was missing is that none of this was VISIBLE in the file: the
-- sheet listed four columns and never said what had been filtered, so a reader
-- had to take on trust both which rows were included and why.
--
-- So two things change:
--
--   * the machine rows carry the Product Master ROW — warranty and contract
--     with the rest — so the sheet can be reconciled line by line against the
--     Product Master screen rather than merely resembling it;
--   * a FILTER row leads the listing, naming the product pattern and the serial
--     pattern actually applied. Where no serial was applied it says so, which
--     is the assurance the instruction is really asking for: everything except
--     Extend XT is filtered on the product and nothing else.
--
-- A NOTE ON `products.active`. Product Master carries the column, it defaults
-- to true, and NOTHING in this system reads it — not the KPI views, not the
-- register. The install base therefore counts every row Product Master holds
-- for the product. Filtering on a column nobody maintains would quietly change
-- every failure rate on the strength of data that has never been kept, so it
-- is left alone and written down here instead.
--
-- The return type gains columns, so the function is DROPPED and recreated:
-- `create or replace function` cannot change a return type.
-- ===========================================================================

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
  cutoff   date;
  v_serial text;
  v_prod   text;
begin
  select * into o from public.quality_objectives where id = p_id;
  if not found then return; end if;
  if not (public.has_perm('calls.view') or public.has_perm('reports.view')) then
    raise exception 'RBAC: you cannot read the calls behind this figure';
  end if;
  cutoff := public.objective_cutoff(o.year, p_month);
  if cutoff < make_date(o.year, p_month, 1) then return; end if;   -- month not reached

  if o.calc_key = 'failure_rate_12m' then
    v_prod   := o.calc_params->>'product';
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');

    -- SHEET 1 — the failures counted, the trailing twelve months to the cutoff.
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
         and c.reg_date > (cutoff - interval '12 months')::date
         and c.reg_date <= cutoff
       order by c.reg_date desc;

    -- SHEET 2 — WHAT WAS FILTERED, then the Product Master rows it selected.
    -- The filter leads the listing so the reader is told which machines are in
    -- and why, rather than inferring it from the rows that happen to be there.
    return query
      select 'filter'::text, ''::text, ''::text, cutoff,
             'Product Master, Product like ' || v_prod,
             case when v_serial = '%' then '(no serial filter — product only)'
                  else 'Serial like ' || v_serial end,
             ''::text, ''::text, ''::text, ''::text,
             ''::text, null::date, null::date, ''::text, null::date, null::date, ''::text;
    return query
      select 'machine'::text, ''::text, ''::text, null::date,
             p.item_name, p.serial_number, p.party_name, ''::text,
             coalesce(p.item_status, ''), ''::text,
             p.warranty_number, p.warranty_start, p.warranty_end,
             p.contract_number, p.contract_start, p.contract_end, p.contract_type
        from public.products p
       where p.item_name ilike v_prod
         and coalesce(p.serial_number, '') ilike v_serial
       order by p.serial_number;
    return;
  end if;

  if o.calc_key = 'open_rate_monthly' then
    -- SHEET 1 — every call of the type raised in the month (the denominator),
    -- each labelled with whether it was still open at the cutoff (the
    -- numerator). Both halves in one list, countable either way.
    return query
      select case when not exists (
                    select 1 from public.reports r
                     where r.ucn = c.ucn
                       and r.call_status ilike 'solved%'
                       and r.updated_at::date <= cutoff)
                  then 'open' else 'closed' end,
             c.ucn, c.call_number, c.reg_date, c.product_name,
             c.serial, c.party_name, c.call_type,
             coalesce(c.open_state, ''), coalesce(c.allocated_to, ''),
             c.warranty_number, c.warranty_start, c.warranty_end,
             c.contract_number, c.contract_start, c.contract_end, c.contract_type
        from public.field_calls c
       where c.cancelled_at is null
         and c.call_type ilike coalesce(o.calc_params->>'call_type', '%')
         and date_trunc('month', c.reg_date) = make_date(o.year, p_month, 1)
         and c.reg_date <= cutoff
       order by c.reg_date;
    -- No install base: this rate is calls over calls, and the sheet says so
    -- rather than being left empty, because an empty sheet reads as a fault.
    return;
  end if;
end $$;
revoke all on function public.objective_evidence(bigint, integer) from public;
grant execute on function public.objective_evidence(bigint, integer) to authenticated;

comment on function public.objective_evidence(bigint, integer) is
  'The rows behind one objective in one month. For a rate: the calls (role failure), then a role=filter row naming the Product Master filter applied, then the machines it selected (role machine), carrying the Product Master row so the sheet reconciles against that screen. Only the Extend objective narrows on serial; every other product is filtered on the product alone. Same query as objective_value, so the figure and its working cannot disagree.';
