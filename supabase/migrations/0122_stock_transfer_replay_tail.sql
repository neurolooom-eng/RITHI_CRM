-- ===========================================================================
-- stock_transfer.sql must leave every object it defines at its LATEST
-- definition. Proven by applying every migration to one database, replaying
-- the bundle on a copy and diffing: without this file, running
-- stock_transfer.sql on its own put 0020's versions back —
--
--   engineer_stock                    the SHEET-ERA derivation, not the one
--                                     over handstock_balance (0039). Column
--                                     names match, so `create or replace`
--                                     succeeds and every hand-stock balance
--                                     silently changes meaning.
--   st_read                           back to a permission-only test, losing
--                                     0041's reporting-tree scope.
--   stock_transfer_lines_check_stock  back to refusing an IMPORTED transfer
--                                     (0089 exempts `source = import`).
--
-- All three are owned by `handstock`, which runs AFTER this module in
-- ALL_ORDER, so a fresh apply is unaffected: each block is guarded on what
-- handstock creates, skips while it is absent, and handstock defines it
-- identically a moment later.
--
-- The definitions here are COPIES. `npm run check:bundles` compares them with
-- the owning migration word for word and fails if either side moves.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- engineer_stock — 0039_material_returns
-- --------------------------------------------------------------------------
do $mirror$
begin
  if to_regclass('public.handstock_balance') is null then
    raise notice 'skip engineer_stock — public.handstock_balance is not present yet';
    return;
  end if;
  drop view if exists public.engineer_stock;
  execute $body$
create view public.engineer_stock as
select b.engineer_key as engineer, b.part, b.on_hand as qty
  from public.handstock_balance b;
  $body$;
  grant select on public.engineer_stock to authenticated;
end $mirror$;

-- --------------------------------------------------------------------------
-- st_read — 0041_stock_read_scope
-- --------------------------------------------------------------------------
do $mirror$
begin
  if to_regproc('public.can_view_all_calls') is null then
    raise notice 'skip st_read — can_view_all_calls() is not present yet';
    return;
  end if;
  drop policy if exists st_read on public.stock_transfers;
  create policy st_read on public.stock_transfers for select
    using (
      (select public.can_view_all_calls())          -- admin + office desks + data.view_all
      or created_by = (select auth.uid())
      or lower(btrim(from_engineer)) in (
           select lower(btrim(n)) from public.visible_engineer_names() as v(n))
      or lower(btrim(to_engineer)) in (
           select lower(btrim(n)) from public.visible_engineer_names() as v(n))
    );
end $mirror$;

-- --------------------------------------------------------------------------
-- stock_transfer_lines_check_stock() — 0089_spare_imports_load
--
-- plpgsql, so its body is not resolved until it runs: no guard needed, and it
-- is correct on a fresh apply as well.
-- --------------------------------------------------------------------------
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
