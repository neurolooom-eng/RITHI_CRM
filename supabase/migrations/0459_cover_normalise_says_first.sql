-- ===========================================================================
-- D-071, URS-072 / FRS-201.7: Normalise cover says what it will hand back
-- BEFORE it runs.
--
-- Normalise cover (cover_unpin_inherited) clears every machine-line value that
-- repeats its entry's, so the line follows the entry from then on. Nothing shown
-- changes on the day -- the value equals the entry's -- but a value somebody
-- pinned on one machine stops being that machine's own, and the next change to
-- the entry overrides it. The legacy importer ran it automatically after a
-- cover import with no statement and no confirmation, and reported "Normalised
-- N item rows" where N was every line that HAS an entry, changed or not.
--
--   1. cover_unpin_preview(): how many values it would hand back, per register
--      and field, read-only. The importer shows it and runs Normalise only on
--      confirmation.
--   2. cover_unpin_inherited(), restated from 0291, now touches only the lines
--      that have a value to hand back, so the count it returns is the count it
--      changed. Its fields and its permission are 0291's, unchanged.
-- ===========================================================================

create or replace function public.cover_unpin_preview()
returns table (register text, field text, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  -- The same audience as cover_unpin_inherited (0247 / 0291): whoever may edit
  -- cover. Nobody signed in (the SQL editor) passes.
  if auth.uid() is not null and not (public.is_admin() or public.has_perm('cover.edit.entries') or public.has_perm('contract.edit.entries')) then
    raise exception 'Only someone who may edit cover (cover.edit) can re-fold cover after an import.';
  end if;
  return query
  select x.reg, x.f, count(*)::bigint
    from (
      select 'Warranty'::text as reg, v.f
        from public.sale_items i
        join public.sale_entries h on h.sa_number = i.sa_number
        cross join lateral (values
          ('invoice_no',      i.invoice_no      is not null and i.invoice_no      is not distinct from h.invoice_no),
          ('invoice_date',    i.invoice_date    is not null and i.invoice_date    is not distinct from h.invoice_date),
          ('sold_through',    i.sold_through    is not null and i.sold_through    is not distinct from h.sold_through),
          ('warranty_start',  i.warranty_start  is not null and i.warranty_start  is not distinct from h.warranty_start),
          ('warranty_end',    i.warranty_end    is not null and i.warranty_end    is not distinct from h.warranty_end),
          ('warranty_years',  i.warranty_years  is not null and i.warranty_years  is not distinct from h.warranty_years),
          ('warranty_months', i.warranty_months is not null and i.warranty_months is not distinct from h.warranty_months),
          ('pm_visits',       i.pm_visits       is not null and i.pm_visits       is not distinct from h.pm_visits),
          ('warranty_status', i.warranty_status is not null and i.warranty_status is not distinct from h.warranty_status),
          ('other_details',   i.other_details   is not null and i.other_details   is not distinct from h.other_details),
          ('state',           i.state           is not null and i.state           is not distinct from h.state),
          ('city',            i.city            is not null and i.city            is not distinct from h.city),
          ('engineer',        i.engineer        is not null and i.engineer        is not distinct from h.engineer)
        ) v(f, hit)
       where v.hit
      union all
      select 'Contract'::text, v.f
        from public.contract_items i
        join public.contract_entries h on h.mc_number = i.mc_number
        cross join lateral (values
          ('entry_at',         i.entry_at         is not null and i.entry_at         is not distinct from h.entry_at),
          ('party_name',       i.party_name       is not null and i.party_name       is not distinct from h.party_name),
          ('payment_schedule', i.payment_schedule is not null and i.payment_schedule is not distinct from h.payment_schedule),
          ('bill_generate_at', i.bill_generate_at is not null and i.bill_generate_at is not distinct from h.bill_generate_at),
          ('contract_type',    i.contract_type    is not null and i.contract_type    is not distinct from h.contract_type),
          ('contract_start',   i.contract_start   is not null and i.contract_start   is not distinct from h.contract_start),
          ('contract_end',     i.contract_end     is not null and i.contract_end     is not distinct from h.contract_end),
          ('contract_years',   i.contract_years   is not null and i.contract_years   is not distinct from h.contract_years),
          ('contract_months',  i.contract_months  is not null and i.contract_months  is not distinct from h.contract_months),
          ('pm_visits_total',  i.pm_visits_total  is not null and i.pm_visits_total  is not distinct from h.pm_visits_total),
          ('status',           i.status           is not null and i.status           is not distinct from h.status)
        ) v(f, hit)
       where v.hit
    ) x
   group by x.reg, x.f
   order by x.reg, x.f;
end $$;
revoke execute on function public.cover_unpin_preview() from public;
do $$ begin
  revoke execute on function public.cover_unpin_preview() from anon;
exception when undefined_object then null; end $$;
grant execute on function public.cover_unpin_preview() to authenticated;

CREATE OR REPLACE FUNCTION public.cover_unpin_inherited()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '180s'
AS $function$
declare n integer := 0; m integer;
begin
  -- 0247: THE COVER ADMIN ACTION IS FOR WHOEVER MAY EDIT COVER. This runs with
  -- the owner's rights over every sale, contract and machine, so it checks the
  -- caller itself. A call with nobody signed in (the SQL editor, a scheduled
  -- job) passes;
  -- the not-signed-in role cannot call it at all (0248 withdraws it).
  if auth.uid() is not null and not (public.is_admin() or public.has_perm('cover.edit.entries') or public.has_perm('contract.edit.entries')) then
    raise exception 'Only someone who may edit cover (cover.edit) can re-fold cover after an import.';
  end if;
  -- 0459: only the lines with a value to hand back, so the count is the count
  -- changed -- the same test cover_unpin_preview() counts by.
  update public.sale_items i set
    invoice_no      = case when i.invoice_no      is not distinct from h.invoice_no      then null else i.invoice_no end,
    invoice_date    = case when i.invoice_date    is not distinct from h.invoice_date    then null else i.invoice_date end,
    sold_through    = case when i.sold_through    is not distinct from h.sold_through    then null else i.sold_through end,
    warranty_start  = case when i.warranty_start  is not distinct from h.warranty_start  then null else i.warranty_start end,
    warranty_end    = case when i.warranty_end    is not distinct from h.warranty_end    then null else i.warranty_end end,
    warranty_years  = case when i.warranty_years  is not distinct from h.warranty_years  then null else i.warranty_years end,
    warranty_months = case when i.warranty_months is not distinct from h.warranty_months then null else i.warranty_months end,
    pm_visits       = case when i.pm_visits       is not distinct from h.pm_visits       then null else i.pm_visits end,
    warranty_status = case when i.warranty_status is not distinct from h.warranty_status then null else i.warranty_status end,
    other_details   = case when i.other_details   is not distinct from h.other_details   then null else i.other_details end,
    state           = case when i.state           is not distinct from h.state           then null else i.state end,
    city            = case when i.city            is not distinct from h.city            then null else i.city end,
    engineer        = case when i.engineer        is not distinct from h.engineer        then null else i.engineer end
  from public.sale_entries h where h.sa_number = i.sa_number
    and ((i.invoice_no      is not null and i.invoice_no      is not distinct from h.invoice_no)
      or (i.invoice_date    is not null and i.invoice_date    is not distinct from h.invoice_date)
      or (i.sold_through    is not null and i.sold_through    is not distinct from h.sold_through)
      or (i.warranty_start  is not null and i.warranty_start  is not distinct from h.warranty_start)
      or (i.warranty_end    is not null and i.warranty_end    is not distinct from h.warranty_end)
      or (i.warranty_years  is not null and i.warranty_years  is not distinct from h.warranty_years)
      or (i.warranty_months is not null and i.warranty_months is not distinct from h.warranty_months)
      or (i.pm_visits       is not null and i.pm_visits       is not distinct from h.pm_visits)
      or (i.warranty_status is not null and i.warranty_status is not distinct from h.warranty_status)
      or (i.other_details   is not null and i.other_details   is not distinct from h.other_details)
      or (i.state           is not null and i.state           is not distinct from h.state)
      or (i.city            is not null and i.city            is not distinct from h.city)
      or (i.engineer        is not null and i.engineer        is not distinct from h.engineer));
  get diagnostics m = row_count; n := n + m;

  update public.contract_items i set
    entry_at         = case when i.entry_at         is not distinct from h.entry_at         then null else i.entry_at end,
    party_name       = case when i.party_name       is not distinct from h.party_name       then null else i.party_name end,
    payment_schedule = case when i.payment_schedule is not distinct from h.payment_schedule then null else i.payment_schedule end,
    bill_generate_at = case when i.bill_generate_at is not distinct from h.bill_generate_at then null else i.bill_generate_at end,
    contract_type    = case when i.contract_type    is not distinct from h.contract_type    then null else i.contract_type end,
    contract_start   = case when i.contract_start   is not distinct from h.contract_start   then null else i.contract_start end,
    contract_end     = case when i.contract_end     is not distinct from h.contract_end     then null else i.contract_end end,
    contract_years   = case when i.contract_years   is not distinct from h.contract_years   then null else i.contract_years end,
    contract_months  = case when i.contract_months  is not distinct from h.contract_months  then null else i.contract_months end,
    pm_visits_total  = case when i.pm_visits_total  is not distinct from h.pm_visits_total  then null else i.pm_visits_total end,
    status           = case when i.status           is not distinct from h.status           then null else i.status end
  from public.contract_entries h where h.mc_number = i.mc_number
    and ((i.entry_at         is not null and i.entry_at         is not distinct from h.entry_at)
      or (i.party_name       is not null and i.party_name       is not distinct from h.party_name)
      or (i.payment_schedule is not null and i.payment_schedule is not distinct from h.payment_schedule)
      or (i.bill_generate_at is not null and i.bill_generate_at is not distinct from h.bill_generate_at)
      or (i.contract_type    is not null and i.contract_type    is not distinct from h.contract_type)
      or (i.contract_start   is not null and i.contract_start   is not distinct from h.contract_start)
      or (i.contract_end     is not null and i.contract_end     is not distinct from h.contract_end)
      or (i.contract_years   is not null and i.contract_years   is not distinct from h.contract_years)
      or (i.contract_months  is not null and i.contract_months  is not distinct from h.contract_months)
      or (i.pm_visits_total  is not null and i.pm_visits_total  is not distinct from h.pm_visits_total)
      or (i.status           is not null and i.status           is not distinct from h.status));
  get diagnostics m = row_count; n := n + m;
  return n;
end $function$;
