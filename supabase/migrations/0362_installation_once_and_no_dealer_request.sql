-- ===========================================================================
-- 0362 — ONE INSTALLATION CALL PER MACHINE AND PER CALL NUMBER; NO
--        INSTALLATION REQUEST FOR A DEALER
--        (second re-review D-150, D-154; the user's decisions, 2026-10-04)
--
-- D-150 -- "+ Installation call" is offered on every transfer and only the
-- browser stopped a second call: measured, two OT- installation calls with the
-- same call number were both registered. THE USER'S DECISION: the button only
-- on dealer transfers (the screen), AND the database refuses (a) a second
-- installation call with the same call number and (b) a second installation
-- call for a machine (product + serial) that already has one. A CANCELLED call
-- does not count (it installed nothing); the same call re-loaded (same UCN) is
-- not a second one; a connection with no session (a repair) is not stopped.
-- Existing duplicates are left as they are and listed by
-- _review_findings_on_live_data.sql row 8.
--
-- D-151 (the Party Master decides who is a dealer) needs no SQL: party_is_dealer()
-- already reads the Party Master, and the screens now ask the Party Master's
-- dealer list instead of the sale's own Type. A column on sale_entries was
-- tried and dropped: every update of a sale re-syncs its machines, so keeping
-- one in step would have re-written the Product Database for every dealer
-- sale, and the details view cannot gain a column a re-run of 0036 removes.
--
-- D-154 -- the dealer rule was on installation_calls alone; an installation
-- CALL REQUEST for a dealer was accepted and refused only at registration.
-- THE USER'S DECISION: refuse it when the request is raised. Same message as
-- 0328; a re-load of the same request line (reqid + product + serial) under the
-- same party stands aside, as 0351 does for the Installation Calls upload.
--
-- In the sales_contracts module, after 0361: party_is_dealer() is 0328's.
-- ===========================================================================

-- ---- D-150 ------------------------------------------------------------------
create or replace function public.installation_call_once()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_other record;
begin
  if auth.uid() is null then return new; end if;                -- a migration, a repair
  if new.cancelled_at is not null then return new; end if;
  if tg_op = 'UPDATE'
     and lower(btrim(coalesce(new.call_number, ''))) = lower(btrim(coalesce(old.call_number, '')))
     and lower(btrim(coalesce(new.product_name, ''))) = lower(btrim(coalesce(old.product_name, '')))
     and lower(btrim(coalesce(new.serial, ''))) = lower(btrim(coalesce(old.serial, ''))) then
    return new;
  end if;

  if btrim(coalesce(new.call_number, '')) <> '' then
    select ic.ucn, ic.call_number into v_other from public.installation_calls ic
     where ic.ucn is distinct from new.ucn and ic.cancelled_at is null
       and lower(btrim(coalesce(ic.call_number, ''))) = lower(btrim(new.call_number))
     limit 1;
    if found then
      raise exception 'Installation call % already carries call number % -- an installation call is raised once',
        v_other.ucn, btrim(new.call_number) using errcode = '23505';
    end if;
  end if;

  if btrim(coalesce(new.serial, '')) <> '' and btrim(coalesce(new.product_name, '')) <> '' then
    select ic.ucn, ic.call_number into v_other from public.installation_calls ic
     where ic.ucn is distinct from new.ucn and ic.cancelled_at is null
       and lower(btrim(coalesce(ic.product_name, ''))) = lower(btrim(new.product_name))
       and lower(btrim(coalesce(ic.serial, ''))) = lower(btrim(new.serial))
     limit 1;
    if found then
      raise exception '% % already has installation call % (%) -- a machine is installed once',
        btrim(new.product_name), btrim(new.serial), v_other.ucn, coalesce(nullif(btrim(v_other.call_number), ''), 'no call number')
        using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.installation_call_once() from public, anon, authenticated;
drop trigger if exists installation_call_once on public.installation_calls;
create trigger installation_call_once
  before insert or update of call_number, product_name, serial on public.installation_calls
  for each row execute function public.installation_call_once();

-- ---- D-154 ------------------------------------------------------------------
create or replace function public.call_request_not_installation_for_dealer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                -- a migration, a repair
  if public.call_table_for(new.call_type) <> 'installation' then return new; end if;
  if tg_op = 'UPDATE'
     and lower(btrim(coalesce(new.party_name, ''))) = lower(btrim(coalesce(old.party_name, '')))
     and public.call_table_for(old.call_type) = 'installation' then
    return new;
  end if;
  -- A re-load of the same request line, party unchanged (the 0351 rule).
  if tg_op = 'INSERT' and exists (
       select 1 from public.call_requests cr
        where cr.reqid is not distinct from new.reqid
          and lower(btrim(coalesce(cr.product, ''))) = lower(btrim(coalesce(new.product, '')))
          and lower(btrim(coalesce(cr.serial_no, ''))) = lower(btrim(coalesce(new.serial_no, '')))
          and lower(btrim(coalesce(cr.party_name, ''))) = lower(btrim(coalesce(new.party_name, '')))) then
    return new;
  end if;
  if public.party_is_dealer(new.party_name) then
    raise exception '% is a dealer: an installation call is not raised for a dealer -- it is raised from the Ownership Transfer when the dealer sells the machine (OT-PRODUCT-SERIAL)', btrim(new.party_name)
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.call_request_not_installation_for_dealer() from public, anon, authenticated;
drop trigger if exists call_request_not_installation_for_dealer on public.call_requests;
create trigger call_request_not_installation_for_dealer
  before insert or update of party_name, call_type on public.call_requests
  for each row execute function public.call_request_not_installation_for_dealer();
