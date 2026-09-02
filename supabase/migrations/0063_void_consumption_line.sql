-- ===========================================================================
-- VOIDING a consumption line — setting the quantity to zero.
--
-- A spare booked against the wrong call, or never actually fitted, has to come
-- off the balance. Deleting the row is not an option and should not be: these
-- are quality records, hard deletes are blocked (0049), and a line that simply
-- vanishes takes its history with it.
--
-- So a line is VOIDED instead: the quantity goes to 0, the row stays, and the
-- original quantity, the reason and who did it stay with it. Hand stock treats
-- a zero-quantity line as consuming nothing, so the spare returns to the
-- engineer's balance — which is exactly what "it was never used" means.
--
-- Creating a line at zero is still refused: an entry that consumes nothing is
-- not something to write in the first place. Zero is only reachable by voiding
-- something that already exists.
-- ===========================================================================

create or replace function public.consumption_adjust_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare avail numeric; delta numeric;
begin
  if coalesce(new.ucn, '')      is distinct from coalesce(old.ucn, '')
  or coalesce(new.part, '')     is distinct from coalesce(old.part, '')
  or coalesce(new.engineer, '') is distinct from coalesce(old.engineer, '')
  or coalesce(new.source, '')   is distinct from coalesce(old.source, '') then
    raise exception 'A reconciliation can only change the quantity — not the call, part, engineer or source';
  end if;

  if new.qty is not distinct from old.qty then
    return new;
  end if;
  -- 0 is allowed here (voiding); negative never is.
  if coalesce(new.qty, 0) < 0 then
    raise exception 'Quantity cannot be negative — set it to 0 to void the line';
  end if;
  if coalesce(btrim(new.adjustment_reason), '') = '' then
    raise exception 'Say why the quantity is being adjusted — the reason is kept with the line';
  end if;

  delta := new.qty - old.qty;
  if delta > 0 and coalesce(btrim(new.engineer), '') <> '' and coalesce(btrim(new.part), '') <> '' then
    select coalesce(b.on_hand, 0) into avail
      from public.handstock_balance b
     where b.engineer_key = public.handstock_key(new.engineer)
       and b.part_code    = public.part_code(new.part);
    if coalesce(avail, 0) < delta then
      raise exception '% has % of % in hand — cannot raise this line from % to %',
        btrim(new.engineer), coalesce(avail, 0), public.part_code(new.part), old.qty, new.qty;
    end if;
  end if;

  if new.original_qty is null then new.original_qty := old.qty; end if;
  new.adjusted_at := now();
  if coalesce(btrim(new.adjusted_by), '') = '' then
    new.adjusted_by := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  end if;
  return new;
end $$;
