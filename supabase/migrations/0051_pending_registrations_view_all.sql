-- ===========================================================================
-- Hotline (and the office roles) must see the WHOLE pending-registration queue,
-- not just their own requests — that queue is the Hotline's work: map each to a
-- call, register a new one, or cancel it. The pend_read policy (0008) only let a
-- user see their own rows or an engineer in their reporting sub-tree, so a
-- Hotline engineer (who has no sub-tree) saw almost none.
--
-- Fold in can_view_all_calls() (0035) — is_admin, data.view_all, and the roles
-- hotline / nsm / commercial / spare_coordinator / stores_incharge /
-- tally_coordinator — exactly as the call register already does. The whole call
-- register is already visible to those roles (0037 / 0040); this brings the
-- pending queue in line.
-- ===========================================================================

drop policy if exists pend_read on public.pending_registrations;
create policy pend_read on public.pending_registrations for select
  using (
    public.can_view_all_calls()              -- admin, data.view_all, Hotline + office roles: the whole queue
    or created_by = auth.uid()               -- your own requests
    or (public.has_perm('calls.view')        -- a manager: requests for an engineer in their reporting sub-tree
        and lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)))
  );
