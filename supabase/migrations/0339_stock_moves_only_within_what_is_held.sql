-- ===========================================================================
-- 0339 — HAND STOCK MOVES ONLY WITHIN WHAT IS HELD, ON EVERY ROUTE
--        (second re-review, 2026-10-03: D-118, D-119, D-122, D-123)
--
-- Hand stock is derived, never stored, and the consumption cap is the control
-- point (CLAUDE.md). The re-review measured four routes round it, each with a
-- signed-in user and no special key:
--
--   D-118  An "imported" marker skips every stock limit -- spare_consumption.
--          source_ref, stock_transfers.source = 'import', material_returns.
--          source = 'import' -- and nothing asked who set it. A consumption of
--          999 with a made-up source_ref was accepted; a transfer marked import
--          moved 50 from an engineer holding nothing.
--   D-119  A transfer's HEADER could be re-pointed after the fact (st_update is
--          the permission alone and the stock check lives on the lines), which
--          took a third engineer from 1 to -9.
--   D-122  A return took ANOTHER engineer's stock: mr_insert compares the email,
--          while stock is counted by the NAME.
--   D-123  Stores could cut a stock-out line's quantity, or delete an opening
--          balance, with no check and no record (-25 and -12, nothing audited).
--
-- WHAT EACH FIX KEEPS WORKING -- read from the code, not assumed:
--   * The importers. Bulk Uploads (`bulk.upload`) writes source_ref on
--     consumption and source = 'import' on transfers and returns; the Data
--     Import panel (`import.panel`) writes source = 'import' on returns. A
--     holder of either key, or a write with no signed-in user (a migration, the
--     service role), is still trusted with history -- stock_import_allowed().
--   * The screens. No screen sets source_ref on a consumption line or 'import'
--     on a transfer or return (grep of src/: only uploads.ts and dataImport.ts),
--     no screen ever updates a transfer header (supabase.ts inserts it, and
--     deletes it again only when its lines are refused), Material Returns sends
--     the signed-in person's own profile name unless they hold
--     stock.return.others, and nothing on any screen updates or deletes a
--     stock-out line or an opening balance.
--   * The database's own writers. Receiving a shipment (0056) touches stock-out
--     lines without changing their quantity; renaming a part (rename_part) or a
--     person (0259/0267) changes the part or the engineer with the quantity
--     untouched. The D-123 guard reacts ONLY to a lower quantity or a delete,
--     so none of them is affected.
--
-- HOW: a marker sent by somebody who may not load history is DISCARDED, not
-- refused (the 0113/0114 rule): an honest client never sends one, and a
-- discarded marker simply leaves the row under the ordinary stock limit. A
-- re-pointed header, another engineer's return and a cut below zero are
-- REFUSED, with the reason, because there the caller asked for the thing itself.
-- ===========================================================================

-- ---- who may write history ---------------------------------------------------
create or replace function public.stock_import_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or public.has_perm('bulk.upload')
      or public.has_perm('import.panel');
$$;
revoke execute on function public.stock_import_allowed() from public, anon, authenticated;

-- ---- D-118: the marker is the importer's alone --------------------------------
-- Named a_… so it fires BEFORE consumption_reconcile_guard and
-- consumption_adjust_guard, which read the marker it settles.
create or replace function public.import_marker_needs_importer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.stock_import_allowed() then return new; end if;
  if tg_table_name = 'spare_consumption' then
    if tg_op = 'INSERT' then
      new.source_ref := '';
    elsif new.source_ref is distinct from old.source_ref then
      new.source_ref := old.source_ref;
    end if;
  else  -- stock_transfers, material_returns: source = 'import'
    if tg_op = 'INSERT' then
      if coalesce(new.source, '') = 'import' then
        new.source := case when tg_table_name = 'material_returns' then 'app' else '' end;
      end if;
    elsif new.source is distinct from old.source then
      new.source := old.source;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.import_marker_needs_importer() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['spare_consumption', 'stock_transfers', 'material_returns'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists a_import_marker_needs_importer on public.%I', t);
      execute format('create trigger a_import_marker_needs_importer before insert or update on public.%I '
                     'for each row execute function public.import_marker_needs_importer()', t);
    end if;
  end loop;
end $$;

-- consumption_adjust_guard (0317, read from the database before replacing):
-- its one exemption -- "the same imported line, re-loaded from its source" --
-- now also asks that the caller may load history. Every other line is 0317's.
create or replace function public.consumption_adjust_guard()
returns trigger language plpgsql security definer set search_path = public as $$
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
  -- by somebody who may load history (0339, D-118).
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
      if delta > coalesce(avail, 0) then
        raise exception 'Only % left in %''s hand stock for %', coalesce(avail, 0), new.engineer, new.part;
      end if;
    end if;
  end if;

  -- RESTORED (0317, D-082): the quantity before the FIRST change, and when the
  -- line was last adjusted. 0081 had both; 0196 rewrote this function from an
  -- older body and dropped them, 0261 and 0316 kept the omission.
  if old.original_qty is null then new.original_qty := old.qty; end if;
  new.adjusted_at := now();
  return new;
end $$;

-- ---- D-119: a recorded transfer is not re-pointed ----------------------------
create or replace function public.stock_transfer_header_fixed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.stock_import_allowed() then return new; end if;
  if lower(btrim(coalesce(new.from_engineer, ''))) is distinct from lower(btrim(coalesce(old.from_engineer, '')))
     and not public.engineer_rename_in_progress(old.from_engineer, new.from_engineer)
  or lower(btrim(coalesce(new.to_engineer, ''))) is distinct from lower(btrim(coalesce(old.to_engineer, '')))
     and not public.engineer_rename_in_progress(old.to_engineer, new.to_engineer)
  or new.transfer_date is distinct from old.transfer_date then
    raise exception 'Transfer % is recorded: its engineers and date are not changed afterwards -- record a new transfer back instead',
      coalesce(nullif(new.uid, ''), old.uid)
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.stock_transfer_header_fixed() from public, anon, authenticated;
drop trigger if exists stock_transfer_header_fixed on public.stock_transfers;
create trigger stock_transfer_header_fixed before update on public.stock_transfers
  for each row execute function public.stock_transfer_header_fixed();

-- ---- D-122: a return is the returner's own stock --------------------------------
-- The policy's email test stays; this adds the test on what the stock is
-- counted by. The name sent by Material Returns is the profile's full name; the
-- User Master's name is accepted too, since hand stock may be keyed by either.
create or replace function public.material_return_is_own_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_me text; v_dir text;
begin
  if public.stock_import_allowed()
     or public.is_admin()
     or public.has_perm('stock.return.others') then
    return new;
  end if;
  select full_name into v_me from public.profiles where id = auth.uid();
  v_dir := public.my_dir_name();
  if public.handstock_key(new.engineer) is distinct from public.handstock_key(coalesce(v_me, ''))
     and public.handstock_key(new.engineer) is distinct from public.handstock_key(coalesce(v_dir, '')) then
    raise exception 'A return is your own stock: % is not you. Returning for somebody else needs "Return stock for another engineer"',
      btrim(new.engineer)
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.material_return_is_own_stock() from public, anon, authenticated;
drop trigger if exists material_return_is_own_stock on public.material_returns;
create trigger material_return_is_own_stock before insert on public.material_returns
  for each row execute function public.material_return_is_own_stock();

-- ---- D-123: a cut or a delete never takes stock below zero, and is recorded ----
create or replace function public.stock_cut_keeps_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_eng text; v_part text; v_bal numeric;
begin
  if public.stock_import_allowed() then return null; end if;
  -- A rename moves the row to another name with its quantity; receiving a
  -- shipment changes no quantity. Only a LOWER quantity or a DELETE is a cut.
  if tg_op = 'UPDATE' and coalesce(new.qty, 0) >= coalesce(old.qty, 0) then return null; end if;
  if tg_table_name = 'spare_dispatch_lines' then
    select r.engineer into v_eng
      from public.spare_request_lines l join public.spare_requests r on r.uid = l.request_uid
     where l.id = old.line_id;
  else
    v_eng := old.engineer;
  end if;
  v_part := old.part;
  if coalesce(btrim(v_eng), '') = '' or coalesce(btrim(v_part), '') = '' then return null; end if;
  v_bal := public.engineer_stock_available(v_eng, v_part);
  if v_bal < 0 then
    raise exception '% would be left with % of % -- correct hand stock through a Hand Stock adjustment, which is checked and kept',
      btrim(v_eng), v_bal, public.part_code(v_part)
      using errcode = '23514';
  end if;
  return null;
end $$;
revoke execute on function public.stock_cut_keeps_balance() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['spare_dispatch_lines', 'handstock_opening'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists stock_cut_keeps_balance on public.%I', t);
      execute format('create trigger stock_cut_keeps_balance after update or delete on public.%I '
                     'for each row execute function public.stock_cut_keeps_balance()', t);
      -- …and the change is imaged, the way 0314 arms the other movement tables.
      if to_regproc('public.record_audit_fn') is not null then
        execute format('drop trigger if exists record_audit_i on public.%I', t);
        execute format('drop trigger if exists record_audit_u on public.%I', t);
        execute format('drop trigger if exists record_audit_d on public.%I', t);
        execute format('create trigger record_audit_i after insert on public.%I '
                       'referencing new table as new_rows for each statement '
                       'execute function public.record_audit_fn()', t);
        execute format('create trigger record_audit_u after update on public.%I '
                       'referencing old table as old_rows new table as new_rows for each statement '
                       'execute function public.record_audit_fn()', t);
        execute format('create trigger record_audit_d after delete on public.%I '
                       'referencing old table as old_rows for each statement '
                       'execute function public.record_audit_fn()', t);
      end if;
    end if;
  end loop;
end $$;
