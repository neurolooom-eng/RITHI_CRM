-- ===========================================================================
-- What the historical spare files hit, found by loading them end to end against
-- a copy of the live database rather than one screen at a time.
--
-- 1. `material_returns.extra` DOES NOT EXIST. The MRN register has always
--    mapped its leftover columns into it, so that upload could never have
--    written a row — the preview said "595 ready" right up to the failure.
--    `npm run check:columns` now resolves every register's columns against a
--    real database, which is the only place that fact lives.
--
-- 2. `stock_transfers.created_by` had NO DEFAULT, while every sibling table
--    defaults it to auth.uid(). `stl_insert` requires the parent transfer to be
--    yours (or you an admin), so with a NULL creator a non-admin could not add
--    lines to a transfer they had just made — in the app as much as in an
--    import. addStockTransfer() then deletes the header and reports the
--    row-level error. Defaulted, as 0009 did for spare_requests.
--
-- 3. The CAP and the transfer STOCK CHECK are controls on entry: an engineer
--    may not report using — or hand on — more than they hold. An import is not
--    entry. It is the record of what already happened, and it is the input the
--    reconciliation is computed FROM; refusing it because our derived stock is
--    still partial (the opening pools and the pre-2026 issues are separate
--    files) is the tail wagging the dog. 0075 already accepted this for the
--    pre-2026 history, which is uncapped by design.
--
--    So a row that carries an IMPORT PROVENANCE is exempt from the shortfall
--    check, and only from that:
--      • consumption — `source_ref`, which only the importer writes;
--      • transfers — the parent's `source = 'import'`, stamped by the register,
--        the same marker 0039 already reads on a material return (which the
--        MRN register simply never stamped, so every historical return was
--        refused for a shortfall).
--    Everything else still holds: quantity above zero, a reconciliation still
--    needs its UCN, engineer, part and reason. A hand-entered line is capped
--    exactly as before, and a negative balance an import reveals is what the
--    Spare Coordinator's reconciliation is for.
-- ===========================================================================

alter table public.material_returns add column if not exists extra jsonb not null default '{}'::jsonb;
comment on column public.material_returns.extra is
  'Everything the source export carried that has no field of its own, kept as written.';

alter table public.stock_transfers alter column created_by set default auth.uid();
alter table public.stock_transfers add column if not exists source text not null default '';
comment on column public.stock_transfers.source is
  'import for a transfer loaded from the sheet era, as material_returns.source already means; empty for one made here.';

-- ---------------------------------------------------------------------------
-- The cap, with the import exemption. Everything else is 0061 unchanged.
-- ---------------------------------------------------------------------------
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

  -- An imported line is a record, not a request: it says what was used, and the
  -- issues that covered it may be in a file that is not loaded yet.
  if coalesce(btrim(new.source_ref), '') <> '' then
    return new;
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

-- ---------------------------------------------------------------------------
-- The transfer stock check, with the same exemption. 0020 otherwise unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.stock_transfer_lines_check_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sender text;
  src    text;
  bal    numeric;
begin
  select from_engineer, coalesce(source, '') into sender, src
    from public.stock_transfers where uid = new.transfer_uid;
  if src = 'import' then
    return null;                    -- a transfer that already happened
  end if;
  bal := public.engineer_stock_available(sender, new.part);
  if bal < 0 then
    -- bal is the balance AFTER this row, so a negative is the shortfall.
    raise exception
      'Stock transfer exceeds available stock: % would be left with % of %',
      sender, bal, trim(new.part);
  end if;
  return null;
end $$;
