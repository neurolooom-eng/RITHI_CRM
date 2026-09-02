-- ===========================================================================
-- No consumption may exceed the engineer's hand stock — reported or not.
--
-- 0060 capped only the office's reconciliation lines and deliberately left a
-- call report uncapped, on the reasoning that the engineer is stating what they
-- actually fitted. In practice an engineer can simply key it wrong, and a wrong
-- report drives the balance negative where nobody is watching.
--
-- So the cap now applies to EVERY consumption line. When a report is refused,
-- the fix belongs to the Spare Coordinator: correct the hand stock (dispatch,
-- transfer, or a reconciliation line) and the report goes through. Control of
-- the balance sits with the coordinator, not with whoever typed last.
--
-- Unattributable rows are the one exception: with no engineer or no part there
-- is no balance to check, so those are allowed rather than blocked — refusing
-- them would strand a call report on a data gap the engineer cannot fix.
-- Mandatory UCN / engineer / reason stay specific to reconciliation lines.
-- ===========================================================================

create or replace function public.consumption_reconcile_guard()
returns trigger language plpgsql security definer set search_path = public as $$
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

  -- THE CAP — every line, however it was written. Skipped only when the row
  -- names no engineer or no part, where there is no balance to check.
  if coalesce(btrim(new.engineer), '') = '' or coalesce(btrim(new.part), '') = '' then
    return new;
  end if;

  select coalesce(b.on_hand, 0) into avail
    from public.handstock_balance b
   where b.engineer_key = public.handstock_key(new.engineer)
     and b.part_code    = public.part_code(new.part);

  if coalesce(avail, 0) < new.qty then
    if is_recon then
      raise exception '% has % of % in hand — cannot book % against this call',
        btrim(new.engineer), coalesce(avail, 0), public.part_code(new.part), new.qty;
    else
      raise exception
        '% has % of % in hand, so % cannot be consumed. Ask the Spare Coordinator to correct the hand stock first.',
        btrim(new.engineer), coalesce(avail, 0), public.part_code(new.part), new.qty;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists consumption_reconcile_guard on public.spare_consumption;
create trigger consumption_reconcile_guard before insert on public.spare_consumption
  for each row execute function public.consumption_reconcile_guard();
