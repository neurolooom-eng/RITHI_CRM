-- ===========================================================================
-- THE EVIDENCE IS A WORKBOOK: THE CALLS, THE MACHINES, THE ARITHMETIC.
--
-- The user's shape (2026-09-07): "List of Field Calls (Sheet1), Installation
-- Base (Sheet2), Calculation (Sheet3)".
--
-- Sheet 2 is why this migration exists. The evidence returned the install base
-- as ONE SUMMARY ROW carrying a count — which is an assertion, not evidence. A
-- denominator of 47 that nobody can list is exactly as good as no denominator:
-- the reader has to take it on trust, and the whole point of the file is that
-- they should not have to.
--
-- So the machines come back as ROWS, one per machine, and the reader can count
-- them. It is not capped: a capped install base is not an install base, and the
-- file exists to be added up.
--
-- The two halves are told apart by `role` — 'failure' / 'open' / 'closed' for a
-- call, 'machine' for one of the installed base — and the page puts each on its
-- own sheet. One query still produces both, so the number and its working
-- cannot disagree.
-- ===========================================================================

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
  if cutoff < make_date(o.year, p_month, 1) then return; end if;   -- month not reached

  if o.calc_key = 'failure_rate_12m' then
    v_serial := coalesce(nullif(btrim(o.calc_params->>'serial'), ''), '%');

    -- SHEET 1 — the failures counted, the trailing twelve months to the cutoff.
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

    -- SHEET 2 — the machines they are counted against, one row each, so the
    -- denominator can be counted rather than believed.
    return query
      select 'machine'::text, ''::text, ''::text, null::date,
             p.item_name, p.serial_number, p.party_name, ''::text,
             coalesce(p.item_status, ''), ''::text
        from public.products p
       where p.item_name ilike (o.calc_params->>'product')
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
             coalesce(c.open_state, ''), coalesce(c.allocated_to, '')
        from public.field_calls c
       where c.cancelled_at is null
         and c.call_type ilike coalesce(o.calc_params->>'call_type', '%')
         and date_trunc('month', c.reg_date) = make_date(o.year, p_month, 1)
         and c.reg_date <= cutoff
       order by c.reg_date;
    -- No sheet 2: this rate is calls over calls. The page says so on the tab
    -- rather than leaving it empty, because an empty sheet reads as a bug.
    return;
  end if;
end $$;
revoke all on function public.objective_evidence(bigint, integer) from public;
grant execute on function public.objective_evidence(bigint, integer) to authenticated;

comment on function public.objective_evidence(bigint, integer) is
  'The rows behind one objective in one month: the calls (role failure / open / closed) and, for a rate, the installed machines they are counted against (role machine), one row each so the denominator can be counted. Same query as objective_value, so the figure and its working cannot disagree.';
