-- ===========================================================================
-- A reconciliation is booked AGAINST A CALL, and cannot consume more than the
-- engineer is holding.
--
-- The office books these lines by hand, so the quantity is typed rather than
-- derived — and a typo would drive an engineer's hand stock negative and
-- quietly corrupt the balance every stock screen reads. The picker only offers
-- parts in that engineer's hand stock, and this guard is the same rule enforced
-- where it cannot be bypassed.
--
-- Only RECONCILIATION rows are capped. A consumption reported from a call is
-- left alone: that is the engineer stating what they actually fitted, and the
-- honest answer to it exceeding the recorded balance is to fix the balance, not
-- to refuse the report.
-- ===========================================================================

create or replace function public.consumption_reconcile_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare avail numeric;
begin
  if coalesce(new.source, 'Report') <> 'Reconciliation' then return new; end if;
  if coalesce(new.qty, 0) <= 0 then
    raise exception 'Quantity must be more than zero';
  end if;

  -- The UCN is what makes this traceable to a call; without it the line is an
  -- unattributed stock write-off. Required, and it has to be a real call.
  if coalesce(btrim(new.ucn), '') = '' then
    raise exception 'A reconciliation needs the UCN of the call the spare was used on';
  end if;
  if not exists (select 1 from public.calls c where c.ucn = btrim(new.ucn)) then
    raise exception 'No call found with UCN % — check the number', btrim(new.ucn);
  end if;

  -- Every field is required on a hand-booked line: whose stock it came off,
  -- what was used, and why. A stock adjustment with no stated reason is not
  -- auditable, which is the whole point of flagging these separately.
  if coalesce(btrim(new.engineer), '') = '' then
    raise exception 'A reconciliation needs the engineer whose hand stock the spare came off';
  end if;
  if coalesce(btrim(new.part), '') = '' then
    raise exception 'A reconciliation needs the part';
  end if;
  if coalesce(btrim(new.remarks), '') = '' then
    raise exception 'A reconciliation needs a reason (why the spare is being booked by hand)';
  end if;

  select coalesce(b.on_hand, 0) into avail
    from public.handstock_balance b
   where b.engineer_key = public.handstock_key(coalesce(new.engineer, ''))
     and b.part_code    = public.part_code(coalesce(new.part, ''));

  if coalesce(avail, 0) < new.qty then
    raise exception '% has % of % in hand — cannot book % against this call',
      coalesce(nullif(btrim(new.engineer), ''), 'That engineer'),
      coalesce(avail, 0), public.part_code(coalesce(new.part, '')), new.qty;
  end if;
  return new;
end $$;

-- Runs after consumption_biu ('c' < 'r'), so `source` is defaulted before the
-- guard reads it.
drop trigger if exists consumption_reconcile_guard on public.spare_consumption;
create trigger consumption_reconcile_guard before insert on public.spare_consumption
  for each row execute function public.consumption_reconcile_guard();
