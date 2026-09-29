-- ===========================================================================
-- A SPARE'S ENGINEER FOLLOWS A USER MASTER RENAME (0259, finding 23).
--
-- Two guards refuse a change of engineer, and both are right to: a
-- consumption line cannot be re-pointed at somebody else
-- (`consumption_adjust_guard`, 0196), and a request's engineer cannot change
-- once its parts have gone out (`spare_request_engineer_guard`, 0100). A
-- rename is neither -- it is the same person under a corrected name, and
-- leaving these rows behind splits their hand stock into two balances.
-- Each guard admits exactly that, recognised by the ticket 0259 files for its
-- own transaction: the name only, the email untouched. Everything else they
-- refuse, they still refuse. Both bodies taken from the database.
-- ===========================================================================

create or replace function public.consumption_adjust_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare avail numeric; delta numeric;
begin
  if coalesce(new.ucn, '')      is distinct from coalesce(old.ucn, '')
  or (coalesce(new.engineer, '') is distinct from coalesce(old.engineer, '')
      -- A USER MASTER RENAME (0259): the same person, spelled correctly. It
      -- changes no quantity, so nothing below has anything to check.
      and not public.engineer_rename_in_progress(old.engineer, new.engineer))
  or coalesce(new.source, '')   is distinct from coalesce(old.source, '') then
    raise exception 'A reconciliation can only change the quantity — not the call, part, engineer or source';
  end if;

  if coalesce(new.part, '') is distinct from coalesce(old.part, '') then
    -- ONLY the substitution rename_part() filed a ticket for, in THIS
    -- transaction, for this exact row's current value. Anything else is a line
    -- being re-pointed, which is what this guard is for.
    if not exists (
      select 1 from public.part_rename_ticket t
       where t.txid = txid_current()
         and t.old_key = lower(btrim(coalesce(old.part, '')))
         and t.new_detail = coalesce(new.part, '')
    ) then
      raise exception 'A reconciliation can only change the quantity — not the call, part, engineer or source';
    end if;
    -- A rename changes no quantity, so the stock arithmetic below has nothing
    -- to check and the cap cannot be affected.
    if new.qty is not distinct from old.qty then return new; end if;
  end if;

  if new.qty is not distinct from old.qty then
    return new;                        -- nothing quantitative changed
  end if;
  if coalesce(new.qty, 0) < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  -- The one exemption: the same imported line, re-loaded from its source.
  if coalesce(btrim(new.source_ref), '') <> ''
     and btrim(new.source_ref) is not distinct from btrim(old.source_ref) then
    return new;
  end if;

  if coalesce(new.qty, 0) <= 0 and coalesce(btrim(new.adjustment_reason), '') = '' then
    raise exception 'Say why the line is being voided — the reason is kept with it';
  end if;
  if coalesce(btrim(new.adjustment_reason), '') = '' then
    raise exception 'Say why the quantity is being adjusted — the reason is kept with the line';
  end if;

  delta := coalesce(new.qty, 0) - coalesce(old.qty, 0);
  if delta > 0 then
    select public.handstock_available(new.engineer, new.part) into avail;
    if avail is not null and delta > avail then
      raise exception 'Only % left in %''s hand stock for %', avail, new.engineer, new.part;
    end if;
  end if;
  return new;
end $$;

create or replace function public.spare_request_engineer_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
begin
  if lower(btrim(coalesce(new.engineer, ''))) is not distinct from lower(btrim(coalesce(old.engineer, '')))
     and lower(btrim(coalesce(new.engineer_email, ''))) is not distinct from lower(btrim(coalesce(old.engineer_email, ''))) then
    return new;                                    -- the engineer is not changing
  end if;
  -- A USER MASTER RENAME (0259) is not a change of engineer: the parts went to
  -- this person and still did. Only the name, and only with its ticket.
  if lower(btrim(coalesce(new.engineer_email, ''))) is not distinct from lower(btrim(coalesce(old.engineer_email, '')))
     and public.engineer_rename_in_progress(old.engineer, new.engineer) then
    return new;
  end if;
  if coalesce(current_setting('rithi.reassigning', true), '') = new.uid then
    return new;                                    -- this is the function's own write
  end if;
  if public.spare_request_is_dispatched(new.uid) then
    raise exception 'OR % has already been dispatched — the engineer cannot be changed once the parts have gone out.',
      coalesce(nullif(new.or_no, ''), new.uid);
  end if;
  return new;
end $$;
