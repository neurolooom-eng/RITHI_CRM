-- ===========================================================================
-- Hand Stock, Stock Transfer and Material Returns follow the same rule as
-- Spare Requests: your own, and your reporting engineers' — nothing else.
--
-- After 0040 scoped the spare register, two gaps were left on the stock side.
--
-- 1. `engineer_stock` was NOT security_invoker, so it ran with the view
--    owner's rights and bypassed row-level security altogether. The Stock
--    Transfer screen reads it through listAllStock() — "every engineer's
--    holding" — so any signed-in user could see every engineer's stock levels,
--    whatever the policies on the tables underneath said.
--
--    0023 deliberately left it definer-rights because engineer_stock_available()
--    reads it. That still works: engineer_stock_available() is SECURITY
--    DEFINER, so inside it the current user is the view's owner, who is not
--    subject to RLS — the overdraw guard keeps seeing every movement, which is
--    exactly what a correctness check needs, while the SCREEN sees only what
--    the person may see.
--
-- 2. `st_read` on stock_transfers was scoped to the reporting tree but tested
--    is_admin() alone, so the office desks — Commercial, NSM, Stores, Hotline,
--    Spare Coordinator, Tally — could not see transfers at all. Everywhere
--    else that is can_view_all_calls(); this brings transfers into line.
--
-- Hand Stock itself needs no change: handstock_balance and handstock_movements
-- are already security_invoker, so they inherit from spare_request_lines (via
-- spare_requests, 0040), spare_consumption (0038) and stock_transfers (below).
-- Material Returns needs none either: mr_read already reads this way.
-- ===========================================================================

-- 1. The derived stock level now answers as the person asking.
alter view public.engineer_stock set (security_invoker = on);

-- 2. Transfers: the desks that move stock for every team can see them.
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
