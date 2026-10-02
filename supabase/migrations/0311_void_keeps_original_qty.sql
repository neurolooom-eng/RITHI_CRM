-- ===========================================================================
-- 0311 -- A VOIDED OR AMENDED CONSUMPTION LINE KEEPS ITS ORIGINAL QUANTITY (D-082),
--         AND A RAISED ONE IS CHECKED AGAINST HAND STOCK AGAIN (D-083)
--
-- consumption_adjust_guard() stamped original_qty (the quantity before the
-- first amendment) and adjusted_at (0062, 0063, 0081). 0196 -- the part
-- rename -- rewrote the function without those two lines and 0261 kept the
-- omission, so FRS-029 ("the original quantity ... retained on the row") had
-- stopped being true. Measured on a database built from every migration.
--
-- D-083, found by this file's own test: 0196 also replaced the hand-stock
-- cap on a RAISE with public.handstock_available(), which does not exist, so
-- raising a line's quantity failed outright. 0081's cap is put back, reading
-- handstock_balance as it did.
--
-- AND: the two lines go back at the end of the quantity path, where
-- 0081 had them. Everything else is 0261 verbatim, read out of a database
-- built from every migration (it carries 0259's engineer-rename exemption and
-- 0261's rename ticket, which 0081 does not). Existing lines are not
-- rewritten: what they lost is in the database change history (0225), not
-- here.
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

  -- A RAISE still has to fit in the engineer's hand stock; a reduction never
  -- does. RESTORED FROM 0081 (0311, D-083): 0196 replaced this with a call to
  -- public.handstock_available(), a function no migration has ever created, so
  -- every raise of a consumption quantity failed with "function ... does not
  -- exist" instead of being checked.
  delta := coalesce(new.qty, 0) - coalesce(old.qty, 0);
  if delta > 0 then
    select coalesce(b.on_hand, 0) into avail
      from public.handstock_balance b
     where b.engineer_key = public.handstock_key(new.engineer)
       and b.part_code = public.part_code(new.part);
    if coalesce(avail, 0) < delta then
      raise exception '% has % of % in hand, so the line cannot be raised by %. Ask the Spare Coordinator to correct the hand stock first.',
        new.engineer, coalesce(avail, 0), public.part_code(new.part), delta;
    end if;
  end if;

  -- RESTORED (0311, D-082): the quantity before the FIRST change, and when
  -- the line was last adjusted. 0081 had both; 0196 rewrote this function
  -- from an older body and dropped them, and 0261 kept the omission.
  if old.original_qty is null then new.original_qty := old.qty; end if;
  new.adjusted_at := now();
  return new;
end $function$;
