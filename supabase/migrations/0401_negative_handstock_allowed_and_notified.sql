-- ===========================================================================
-- A SPARE MAY BE CONSUMED BEYOND THE HAND STOCK; THE SPARE COORDINATOR IS TOLD.
--
-- The user, 2026-10-08, on a visit that saved while its spares were refused
-- ("ABHISHEK BISWAS has 0 of ESA-009 in hand, so 1 cannot be consumed"):
-- "Allow even if it's negative but notify the Spare Coordinator about the
-- negative spare."
--
-- UNTIL NOW consumption was the hand-stock CONTROL POINT (0061): a line larger
-- than the engineer's balance was refused, and the correction had to come
-- first. That kept the balance from going below zero, at the price of a part
-- that WAS fitted not being recorded at all -- the visit saved and its spares
-- did not. The user has chosen the other order: record what was fitted, then
-- correct the stock. So:
--
--   consumption_reconcile_guard (insert) -- the over-balance line is BOOKED
--     and notify_negative_handstock() is called in place of the refusal. Every
--     other rule in it is unchanged: the quantity must be positive, a
--     reconciliation still needs its UCN, engineer, part and reason, and an
--     imported line still skips the check.
--   consumption_adjust_guard (update) -- raising a saved line past the balance
--     is allowed and notified the same way; its other rules are unchanged.
--
-- Both bodies were READ OUT OF A DATABASE built from every migration before
-- being replaced (CLAUDE.md: a function rewritten from an old revision loses
-- the rules added since), and only the refusal is changed in each.
--
-- NOT CHANGED: stock transfers and material returns still move only what is
-- held (0339) -- handing over or returning stock you do not have is a
-- different thing from recording a part you fitted. The recycling stock (0355)
-- keeps its own limit.
--
-- THE NOTIFICATION goes to every ACTIVE profile whose role is
-- spare_coordinator, on the bell, linking to Hand Stock. Nobody holding that
-- role means nobody is told -- the line is still booked; _status.sql row 321
-- says how many coordinators would receive it.
-- ===========================================================================

create or replace function public.notify_negative_handstock(
  p_engineer text, p_part text, p_avail numeric, p_qty numeric, p_ucn text, p_how text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare after numeric := coalesce(p_avail, 0) - coalesce(p_qty, 0);
begin
  insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
  select p.id, coalesce(p.email, ''), 'negative_handstock',
         'Hand stock gone negative: ' || public.part_code(p_part),
         concat_ws(' · ',
           btrim(coalesce(p_engineer, '')),
           nullif(btrim(coalesce(p_part, '')), ''),
           'had ' || trim(to_char(coalesce(p_avail, 0), 'FM999999990.##')) || ', '
             || trim(to_char(coalesce(p_qty, 0), 'FM999999990.##')) || ' consumed, now '
             || trim(to_char(after, 'FM999999990.##')),
           nullif('UCN ' || btrim(coalesce(p_ucn, '')), 'UCN '),
           nullif(btrim(coalesce(p_how, '')), '')),
         '/handstock'
    from public.profiles p
   where p.role = 'spare_coordinator' and coalesce(p.active, true);
end $$;
comment on function public.notify_negative_handstock(text, text, numeric, numeric, text, text) is
  'Tells every active Spare Coordinator that a consumption took an engineer''s hand stock of a part below zero (0401). Called by consumption_reconcile_guard and consumption_adjust_guard only.';
-- Called only by the two definer triggers above, which run as the owner.
revoke execute on function public.notify_negative_handstock(text, text, numeric, numeric, text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consumption_reconcile_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare avail numeric; is_recon boolean;
begin
  is_recon := coalesce(new.source, 'Report') = 'Reconciliation';

  if coalesce(new.qty, 0) <= 0 then
    raise exception 'Quantity must be more than zero';
  end if;

  -- Everything is required on a hand-booked line: whose stock it came off,
  -- what was used, and why. A stock adjustment with no stated reason is not
  -- auditable, which is the point of flagging these separately.
  if is_recon then
    if coalesce(btrim(new.ucn), '') = '' then
      raise exception 'A reconciliation needs the UCN of the call the spare was used on';
    end if;
    if not exists (select 1 from public.calls c where c.ucn = btrim(new.ucn)) then
      raise exception 'No call found with UCN % — check the number', btrim(new.ucn);
    end if;
    if coalesce(btrim(new.engineer), '') = '' then
      raise exception 'A reconciliation needs the engineer whose hand stock the spare came off';
    end if;
    if coalesce(btrim(new.part), '') = '' then
      raise exception 'A reconciliation needs the part';
    end if;
    if coalesce(btrim(new.remarks), '') = '' then
      raise exception 'A reconciliation needs a reason (why the spare is being booked by hand)';
    end if;
  end if;

  -- An imported line is a record, not a request: it says what was used, and the
  -- issues that covered it may be in a file that is not loaded yet.
  if coalesce(btrim(new.source_ref), '') <> '' then
    return new;
  end if;

  -- THE BALANCE CHECK — every line, however it was written. Skipped only when
  -- the row names no engineer or no part, where there is no balance to check.
  if coalesce(btrim(new.engineer), '') = '' or coalesce(btrim(new.part), '') = '' then
    return new;
  end if;

  select coalesce(b.on_hand, 0) into avail
    from public.handstock_balance b
   where b.engineer_key = public.handstock_key(new.engineer)
     and b.part_code    = public.part_code(new.part);

  -- NO LONGER A REFUSAL (0401, the user, 2026-10-08: "Allow even if it's
  -- negative but notify the Spare Coordinator about the negative spare").
  -- The line is booked as reported and the hand stock goes below zero; every
  -- active Spare Coordinator is told, so the stock is corrected afterwards
  -- rather than the consumption being refused beforehand.
  if coalesce(avail, 0) < new.qty then
    perform public.notify_negative_handstock(
      new.engineer, new.part, coalesce(avail, 0), new.qty, new.ucn,
      case when is_recon then 'Reconciliation' else 'Visit' end);
  end if;
  return new;
end $function$;

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

  -- The one exemption: the same imported line, re-loaded from its source --
  -- by somebody who may load history (0339, D-119).
  if coalesce(btrim(new.source_ref), '') <> ''
     and btrim(new.source_ref) is not distinct from btrim(old.source_ref)
     and public.stock_import_allowed() then
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
      -- Raising a line past the balance is allowed too, and notified (0401).
      if delta > coalesce(avail, 0) then
        perform public.notify_negative_handstock(
          new.engineer, new.part, coalesce(avail, 0), delta, new.ucn, 'Quantity raised');
      end if;
    end if;
  end if;

  -- RESTORED (0317, D-082): the quantity before the FIRST change, and when the
  -- line was last adjusted. 0081 had both; 0196 rewrote this function from an
  -- older body and dropped them, 0261 and 0316 kept the omission.
  if old.original_qty is null then new.original_qty := old.qty; end if;
  new.adjusted_at := now();
  return new;
end $function$;
