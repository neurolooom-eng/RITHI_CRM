-- ===========================================================================
-- Spare consumption / Hand Stock — scope to my own & my team, like calls.
--
-- cons_read granted every consumption.view holder ALL rows; the client then
-- filtered by engineer, which fails open when the viewer's name/email doesn't
-- resolve. So an engineer could see a peer's consumption (and, via the
-- security_invoker handstock views, a peer's hand stock).
--
-- Now the database scopes it: admins, the office/coordination roles and a
-- data.view_all holder see everything (they reconcile across engineers);
-- everyone else sees only rows they raised, that are for their own email, or
-- that belong to an engineer in their reporting sub-tree. spare_requests and
-- its lines are already scoped this way; the handstock_balance /
-- handstock_movements views are security_invoker, so they inherit this.
-- ===========================================================================

-- The email this policy matches on is added by 0023_handstock.sql, which the
-- consolidated file applies long AFTER this one — so add it here too rather
-- than depend on an ordering that does not hold. Idempotent either way.
alter table public.spare_consumption
  add column if not exists engineer_email text default '';

drop policy if exists cons_read on public.spare_consumption;
create policy cons_read on public.spare_consumption for select
  using (
    (select public.can_view_all_calls())          -- admin + office roles + data.view_all
    or created_by = (select auth.uid())
    or lower(engineer_email) = lower((select auth.email()))
    or lower(trim(engineer)) in (
         select lower(trim(n)) from public.visible_engineer_names() as v(n)
       )
  );
