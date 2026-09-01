-- ===========================================================================
-- Hotline (and the office roles) must see the whole Pending Registrations
-- queue. That screen reads call_requests (rows with no UCN yet), gated by
-- cr_read (0003) — which only showed a user their own requests or an engineer
-- in their reporting sub-tree, with no office-role bypass. So a Hotline engineer
-- saw only the request they raised themselves.
--
-- Fold can_view_all_calls() (admin / data.view_all / hotline / nsm / commercial
-- / spare_coordinator / stores_incharge / tally_coordinator) into cr_read, in
-- line with the call registers and pending_registrations.
-- ===========================================================================

drop policy if exists cr_read on public.call_requests;
create policy cr_read on public.call_requests for select using (
  public.can_view_all_calls()
  or created_by = auth.uid()
  or lower(email) = lower(auth.email())
  or lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n))
);
