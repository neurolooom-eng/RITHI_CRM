-- ===========================================================================
-- 0182 — A TRANSFER IS NOT REFUSED BECAUSE THE MACHINE IS ALREADY THERE.
--
-- Reported from use, loading the Ownership Transfer register:
--
--   new row for relation "ownership_transfers" violates check constraint
--   "ownership_transfer_parties_differ" (row ~1) (0 written before it stopped.)
--
-- REPRODUCED, not guessed. 0072 fills a blank `from_party` from the MACHINE
-- MASTER — "who holds it now, per the machine master — the truthful from" —
-- and that is right while the master still shows the PREVIOUS owner. It is
-- wrong the moment the master has already caught up: the fill then returns the
-- destination party itself, from and to come out identical, and the constraint
-- refuses the row. One such row stops the whole file.
--
-- And it is not a rare corner. A Product Master imported from the live system
-- already names each machine's CURRENT owner, so loading the transfer HISTORY
-- into it hits this on the last hop of every machine — the register is at its
-- most unloadable exactly when the master is most correct.
--
-- FILLING IT WITH THE DESTINATION IS NEVER RIGHT. "This machine went from
-- Apollo to Apollo" is not a fact about anything; it is the master saying it
-- cannot answer. So the fill is now CONDITIONAL, and where the master cannot
-- answer, `from_party` is left EMPTY — which is what the column's own default
-- already means: the predecessor is not known. The transfer is still recorded,
-- with the thing that IS known (it went to this party, on this date) rather
-- than being discarded for want of the thing that is not.
--
-- The constraint is untouched, deliberately. A transfer between one party and
-- itself is not a transfer, and that invariant is worth keeping; what was wrong
-- was manufacturing a value that violated it.
-- ===========================================================================

create or replace function public.ownership_transfer_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_serial text := btrim(coalesce(new.serial_number, ''));
  v_holder text;
begin
  if v_serial = '' then
    raise exception 'An ownership transfer needs the machine serial number.';
  end if;
  if btrim(coalesce(new.to_party, '')) = '' then
    raise exception 'An ownership transfer needs the party it is going to.';
  end if;

  if tg_op = 'INSERT' then
    new.recorded_by := coalesce(new.recorded_by, auth.uid());
    -- Who holds it now, per the machine master — the truthful "from", BUT ONLY
    -- WHERE IT IS ACTUALLY AN ANSWER. Reading it into a local first is the
    -- whole change: assigning straight into new.from_party is what let the
    -- destination's own name land there and take the row down with it.
    if btrim(coalesce(new.from_party, '')) = '' then
      select coalesce(p.party_name, '') into v_holder
        from public.products p
       where lower(btrim(p.serial_number)) = lower(v_serial)
       limit 1;
      if lower(btrim(coalesce(v_holder, ''))) is distinct from lower(btrim(new.to_party)) then
        new.from_party := coalesce(v_holder, '');
      end if;
      -- else: the master has already caught up and cannot name the
      -- predecessor. from_party stays '' — "not known" — rather than becoming
      -- a copy of the destination.
    end if;
    if btrim(coalesce(new.item_name, '')) = '' then
      select coalesce(p.item_name, '') into new.item_name
        from public.products p
       where lower(btrim(p.serial_number)) = lower(v_serial)
       limit 1;
    end if;
  else
    new.recorded_by := old.recorded_by;   -- authorship is not editable
    new.created_at  := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
