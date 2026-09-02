-- ===========================================================================
-- ADJUSTING A CONSUMPTION QUANTITY (part of reconciliation).
--
-- An engineer can report the wrong quantity, and until now nothing could put it
-- right: spare_consumption had no UPDATE policy at all, so the row was frozen
-- and the balance stayed wrong. The Spare Coordinator can now correct the
-- quantity — and only the quantity.
--
-- What is kept:
--   • on the row — original_qty, adjusted_by, adjusted_at and the reason, so
--     the correction is visible where the line is read;
--   • in the audit trail — record_audit (0048) already logs every UPDATE with
--     the full before/after, so nothing depends on the row being honest.
--
-- What cannot be changed: the call, the part, the engineer or the source. A
-- reconciliation corrects a NUMBER; letting it rewrite whose stock or which
-- call would turn an adjustment into a way of rewriting history. Change those
-- by dropping the line and booking the right one.
-- ===========================================================================

alter table public.spare_consumption
  add column if not exists original_qty      numeric,
  add column if not exists adjusted_by       text,
  add column if not exists adjusted_at       timestamptz,
  add column if not exists adjustment_reason text;

-- Correcting a line is the reconciler's job, same permission as booking one.
drop policy if exists cons_update on public.spare_consumption;
create policy cons_update on public.spare_consumption for update
  using (public.has_perm('consumption.reconcile'))
  with check (public.has_perm('consumption.reconcile'));

create or replace function public.consumption_adjust_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare avail numeric; delta numeric;
begin
  -- Identity is fixed: a reconciliation adjusts the quantity, nothing else.
  if coalesce(new.ucn, '')      is distinct from coalesce(old.ucn, '')
  or coalesce(new.part, '')     is distinct from coalesce(old.part, '')
  or coalesce(new.engineer, '') is distinct from coalesce(old.engineer, '')
  or coalesce(new.source, '')   is distinct from coalesce(old.source, '') then
    raise exception 'A reconciliation can only change the quantity — not the call, part, engineer or source';
  end if;

  if new.qty is not distinct from old.qty then
    return new;                        -- nothing quantitative changed
  end if;
  if coalesce(new.qty, 0) <= 0 then
    raise exception 'Quantity must be more than zero';
  end if;
  if coalesce(btrim(new.adjustment_reason), '') = '' then
    raise exception 'Say why the quantity is being adjusted — the reason is kept with the line';
  end if;

  -- Raising it consumes more stock: the extra has to be in hand. on_hand
  -- already accounts for the quantity this line consumes today, so only the
  -- DELTA is checked. Lowering it always gives stock back.
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

  -- Keep what it was before the FIRST adjustment, and stamp who/when.
  if new.original_qty is null then new.original_qty := old.qty; end if;
  new.adjusted_at := now();
  if coalesce(btrim(new.adjusted_by), '') = '' then
    new.adjusted_by := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  end if;
  return new;
end $$;

drop trigger if exists consumption_adjust_guard on public.spare_consumption;
create trigger consumption_adjust_guard before update on public.spare_consumption
  for each row execute function public.consumption_adjust_guard();
