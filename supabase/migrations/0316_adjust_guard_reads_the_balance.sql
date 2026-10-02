-- ===========================================================================
-- RAISING A CONSUMPTION LINE'S QUANTITY WORKS AGAIN (found 2026-10-02 while
-- proving D-042).
--
-- 0196 rewrote consumption_adjust_guard() and, for a quantity going UP, asked
-- `public.handstock_available(new.engineer, new.part)` -- a function no
-- migration has ever defined. plpgsql resolves a call when it RUNS, so the
-- rewrite applied cleanly and every check passed; 0261 then copied the line.
-- What it cost: every upward adjustment of a consumption line -- the Spare
-- Coordinator correcting 1 to 2 -- failed with
--   function public.handstock_available(text, text) does not exist
-- while a reduction and a void went through. No suite raised a quantity, which
-- is how it lasted.
--
-- THE FIX reads the balance exactly as the insert cap does
-- (consumption_reconcile_guard: handstock_balance.on_hand by engineer key and
-- part code, a line with no engineer or no part unchecked), and refuses an
-- increase beyond what is in hand -- 0062's original rule. A missing balance
-- row is 0 in hand, as at insert. Everything else is 0261's definition, read
-- out of a database built from every migration, unchanged.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.consumption_adjust_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- THE BALANCE THE INSERT CAP READS (consumption_reconcile_guard), and the
    -- same skip for a line naming no engineer or no part. 0196 called a
    -- helper here that no migration defines (see the header).
    -- A nested test, not an early return: what follows this block stamps
    -- original_qty and adjusted_at, and must run for every adjustment.
    if coalesce(btrim(new.engineer), '') <> '' and coalesce(btrim(new.part), '') <> '' then
      select coalesce(b.on_hand, 0) into avail
        from public.handstock_balance b
       where b.engineer_key = public.handstock_key(new.engineer)
         and b.part_code    = public.part_code(new.part);
      if delta > coalesce(avail, 0) then
        raise exception 'Only % left in %''s hand stock for %', coalesce(avail, 0), new.engineer, new.part;
      end if;
    end if;
  end if;
  return new;
end $function$;
