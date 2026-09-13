-- ===========================================================================
-- 0183 — A "FROM" THAT EQUALS THE "TO" IS NOT A ROW TO THROW AWAY.
--
-- Reported from use with the real export: loading the AppSheet Ownership
-- Transfer register, 2,985 of 4,327 rows were held back, every one of them
-- reading "already with <party> — not a transfer".
--
-- 0182 established the principle on the value this system FILLS IN: where the
-- source cannot name the predecessor, "from Apollo to Apollo" is not a fact, it
-- is the source saying so, and the honest record is the hand-over with an EMPTY
-- from_party rather than no hand-over at all.
--
-- The export's own `Party Name (FROM)` has exactly the same defect, for exactly
-- the same reason: it resolves to WHO HOLDS THE MACHINE NOW, so for every
-- transfer that has already been applied — which is most of a historical
-- register — it reads back as the destination. Applying the principle to the
-- filled-in value and not to the supplied one is a distinction the data does
-- not support, and it cost 69% of the file.
--
-- So a supplied from_party equal to to_party is treated as NOT SUPPLIED. The
-- row then takes the same path as a blank one: ask the machine master, and
-- accept its answer only if it is an answer. What is kept either way is what is
-- actually known — this machine went to this party, on this date, under this OT
-- number — and what is dropped is only the part that was never information.
--
-- THE CONSTRAINT STAYS. It is now unreachable through the trigger, which is the
-- point: the invariant is still declared, and nothing can write a row that
-- breaks it. Removing it would leave the rule true only by habit.
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

    -- A SUPPLIED "FROM" THAT IS THE DESTINATION IS NOT AN ANSWER. Discard it
    -- and fall through to the master, exactly as a blank one would.
    if lower(btrim(coalesce(new.from_party, ''))) = lower(btrim(new.to_party)) then
      new.from_party := '';
    end if;

    -- Who holds it now, per the machine master — the truthful "from", BUT ONLY
    -- WHERE IT IS ACTUALLY AN ANSWER (0182).
    if btrim(coalesce(new.from_party, '')) = '' then
      select coalesce(p.party_name, '') into v_holder
        from public.products p
       where lower(btrim(p.serial_number)) = lower(v_serial)
       limit 1;
      if lower(btrim(coalesce(v_holder, ''))) is distinct from lower(btrim(new.to_party)) then
        new.from_party := coalesce(v_holder, '');
      end if;
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
