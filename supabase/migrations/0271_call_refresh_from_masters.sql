-- ===========================================================================
-- A CALL'S PARTY DETAILS AND PRODUCT DETAILS, REFRESHED FROM THE MASTERS.
--
--   The user, 2026-09-30: "Give a Provision to update Party Details and
--   Product Details as Separate Functions in the Call View. The Party Details
--   update should update the City, State. Product Details should update the
--   Warranty No, Warranty Start Date, Warranty End Date, Contract No, Contract
--   Start Date, Contract End Date, Contract Type, Item Status -- As on the Date
--   of Call registration." And: "This Button falls under Audit Mode, this can
--   be enabled when the Audit Mode is disabled and should be hidden when Audit
--   Mode is enabled. It's a Non Auditable Requirement."
--
-- THEIR ANSWERS, which this file implements and nothing more:
--   * AS ON THE REGISTRATION DATE: the warranty and the contract RUNNING on the
--     call's reg_date. Where none was running, the LAST ONE THAT HAD ENDED
--     before that date is shown for reference and the Item Status is OGP.
--   * Both running: WARRANTY DECIDES (WGP) -- Product Database 2.0's rule --
--     and both sets of numbers and dates are still written.
--   * ANY CALL, ANY STATUS, Solved and Cancelled included: this copies master
--     data onto the call, it does not change what happened on it.
--   * One call from the Call View, or many ticked in a register.
--   * NOT WHILE AUDIT MODE IS ON (0114). The screen hides the buttons; these
--     functions REFUSE as well, so the rule does not depend on a screen. This is
--     the FIRST behaviour conditioned on Audit Mode (NAR-001, NAR-006).
--
-- THE SOURCES: City / State from the PARTY MASTER, by the call's party name
-- (name_key, 0076). Cover from the REGISTERS THAT KEEP EVERY PERIOD --
-- warranty_sale_details and contract_details (0036), matched on the MACHINE
-- (product + serial, machine_key, 0218), never the serial alone. Product
-- Database 2.0 cannot answer "as on a date": it keeps only the latest warranty
-- and contract per machine.
--
-- A PARTY THE MASTER DOES NOT HAVE IS LEFT ALONE -- its City and State are not
-- blanked -- and is counted, so the screen can say how many were not found.
--
-- WHO: the caller's own rights (INVOKER), through the `calls` view and its
-- policies, and only with `calls.edit` or `calls.edit.customer` -- checked
-- here because the warranty and contract columns are in no edit section of
-- their own (0127), and a contact-only editor must not reach them through
-- this. The cover LOOKUP is a definer function, so the answer does not depend
-- on whether the caller may read the cover registers: an engineer without that
-- read would otherwise be told "no cover" and have OGP written to the call.
-- ===========================================================================

-- ---- the cover of one machine on one date -----------------------------------
create or replace function public.call_cover_as_of(p_product text, p_serial text, p_date date)
returns table (
  warranty_number text, warranty_start date, warranty_end date,
  contract_number text, contract_start date, contract_end date, contract_type text,
  item_status text, warranty_running boolean, contract_running boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  k  text := public.machine_key(p_product, p_serial);
  d  date := coalesce(p_date, current_date);
  w  record;
  c  record;
  wr boolean := false;
  cr boolean := false;
begin
  if btrim(coalesce(p_serial, '')) = '' or btrim(coalesce(p_product, '')) = '' then
    return query select null::text, null::date, null::date, null::text, null::date, null::date, null::text,
                        'OGP'::text, false, false;
    return;
  end if;

  -- The warranty running on the date; else the last one that had ended.
  select s.sa_number, s.warranty_start, s.warranty_end into w
    from public.warranty_sale_details s
   where public.machine_key(s.product_name, s.serial_number) = k
     and coalesce(s.warranty_start, '-infinity'::date) <= d and s.warranty_end >= d
   order by s.warranty_start desc nulls last, s.warranty_end desc
   limit 1;
  if found then wr := true;
  else
    select s.sa_number, s.warranty_start, s.warranty_end into w
      from public.warranty_sale_details s
     where public.machine_key(s.product_name, s.serial_number) = k and s.warranty_end < d
     order by s.warranty_end desc, s.warranty_start desc nulls last
     limit 1;
  end if;

  -- The contract, the same way.
  select x.mc_number, x.contract_start, x.contract_end, x.contract_type into c
    from public.contract_details x
   where public.machine_key(x.product_name, x.serial_number) = k
     and coalesce(x.contract_start, '-infinity'::date) <= d and x.contract_end >= d
   order by x.contract_start desc nulls last, x.contract_end desc
   limit 1;
  if found then cr := true;
  else
    select x.mc_number, x.contract_start, x.contract_end, x.contract_type into c
      from public.contract_details x
     where public.machine_key(x.product_name, x.serial_number) = k and x.contract_end < d
     order by x.contract_end desc, x.contract_start desc nulls last
     limit 1;
  end if;

  return query select
    w.sa_number::text, w.warranty_start::date, w.warranty_end::date,
    c.mc_number::text, c.contract_start::date, c.contract_end::date, c.contract_type::text,
    case when wr then 'WGP'
         when cr then coalesce(public.contract_cover_code(c.contract_type), 'CONTRACT (TYPE NOT RECORDED)')
         else 'OGP' end,
    wr, cr;
end $$;
revoke execute on function public.call_cover_as_of(text, text, date) from public, anon;
grant execute on function public.call_cover_as_of(text, text, date) to authenticated;

-- ---- the gate both updates share ------------------------------------------------
create or replace function public.call_refresh_allowed()
returns void language plpgsql stable set search_path = public as $$
begin
  if coalesce(public.audit_mode(), false) then
    raise exception 'Audit Mode is ON: a call''s party and product details cannot be refreshed from the masters until an administrator turns it off.'
      using errcode = '42501';
  end if;
  if not (public.has_perm('calls.edit') or public.has_perm('calls.edit.customer')) then
    raise exception 'RBAC: refreshing a call''s party or product details needs calls.edit or calls.edit.customer.'
      using errcode = '42501';
  end if;
end $$;
revoke execute on function public.call_refresh_allowed() from public, anon;
grant execute on function public.call_refresh_allowed() to authenticated;

-- ---- PARTY DETAILS: City and State from the Party Master ---------------------
-- Returns { updated, unmatched }: calls changed, and calls whose party the
-- Party Master does not hold (left as they were).
create or replace function public.refresh_calls_party(p_ucns text[])
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  r record; p record; n int; updated int := 0; unmatched int := 0;
begin
  perform public.call_refresh_allowed();
  for r in select c.ucn, c.party_name, c.city, c.state from public.calls c where c.ucn = any(p_ucns) loop
    select pa.city, pa.state into p from public.parties pa
     where pa.name_key = lower(btrim(coalesce(r.party_name, ''))) limit 1;
    if not found then unmatched := unmatched + 1; continue; end if;
    if coalesce(p.city, '') is distinct from coalesce(r.city, '')
       or coalesce(p.state, '') is distinct from coalesce(r.state, '') then
      update public.calls set city = coalesce(p.city, ''), state = coalesce(p.state, '') where ucn = r.ucn;
      get diagnostics n = row_count;
      updated := updated + n;
    end if;
  end loop;
  return jsonb_build_object('updated', updated, 'unmatched', unmatched);
end $$;
revoke execute on function public.refresh_calls_party(text[]) from public, anon;
grant execute on function public.refresh_calls_party(text[]) to authenticated;

-- ---- PRODUCT DETAILS: cover as on the registration date ------------------------
-- Returns { updated }.
create or replace function public.refresh_calls_product(p_ucns text[])
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  r record; v record; n int; updated int := 0;
begin
  perform public.call_refresh_allowed();
  for r in select c.ucn, c.product_name, c.serial, c.reg_date,
                  c.warranty_number, c.warranty_start, c.warranty_end,
                  c.contract_number, c.contract_start, c.contract_end, c.contract_type, c.item_status
             from public.calls c where c.ucn = any(p_ucns) loop
    select * into v from public.call_cover_as_of(r.product_name, r.serial, r.reg_date);
    if coalesce(v.warranty_number, '') is distinct from coalesce(r.warranty_number, '')
       or v.warranty_start is distinct from r.warranty_start or v.warranty_end is distinct from r.warranty_end
       or coalesce(v.contract_number, '') is distinct from coalesce(r.contract_number, '')
       or v.contract_start is distinct from r.contract_start or v.contract_end is distinct from r.contract_end
       or coalesce(v.contract_type, '') is distinct from coalesce(r.contract_type, '')
       or public.cover_code(coalesce(v.item_status, '')) is distinct from public.cover_code(coalesce(r.item_status, '')) then
      update public.calls
         set warranty_number = coalesce(v.warranty_number, ''), warranty_start = v.warranty_start, warranty_end = v.warranty_end,
             contract_number = coalesce(v.contract_number, ''), contract_start = v.contract_start, contract_end = v.contract_end,
             contract_type = coalesce(v.contract_type, ''), item_status = v.item_status
       where ucn = r.ucn;
      get diagnostics n = row_count;
      updated := updated + n;
    end if;
  end loop;
  return jsonb_build_object('updated', updated);
end $$;
revoke execute on function public.refresh_calls_product(text[]) from public, anon;
grant execute on function public.refresh_calls_product(text[]) to authenticated;
