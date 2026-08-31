-- ===========================================================================
-- data.view_all — a per-user (or per-role) grant for FULL data visibility, used
-- by a "Permissions + Data" clone. Folded into the read paths so the holder
-- sees every call, spare request/line, report and consumption row.
-- ===========================================================================

-- Calls / reports (reports read via can_see_call).
create or replace function public.can_view_all_calls()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.has_perm('data.view_all')
      or exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and lower(coalesce(p.role, '')) in
               ('hotline', 'nsm', 'commercial', 'spare_coordinator', 'stores_incharge', 'tally_coordinator')
      );
$$;

-- Spare requests (lines read follows the request).
drop policy if exists sr_read on public.spare_requests;
create policy sr_read on public.spare_requests for select
  using (public.is_admin() or public.has_perm('data.view_all') or created_by = auth.uid()
    or lower(engineer_email) = lower(auth.email())
    or public.can_approve_spares()
    or lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)));

-- Consumption.
drop policy if exists cons_read on public.spare_consumption;
create policy cons_read on public.spare_consumption for select
  using (public.has_perm('consumption.view') or public.has_perm('data.view_all'));
