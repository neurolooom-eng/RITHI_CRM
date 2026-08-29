-- ===========================================================================
-- Let a creator read back the call they just inserted (so insert...returning
-- works for everyone, not only admins). Fixes "new call saved locally / pending"
-- when the register is on Supabase.
-- ===========================================================================

drop policy if exists calls_scoped_read on public.calls;
create policy calls_scoped_read on public.calls for select
  using (public.can_see_call(allocated_to) or created_by = auth.uid());

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update
  using (public.can_see_call(allocated_to) or created_by = auth.uid())
  with check (public.can_see_call(allocated_to) or created_by = auth.uid());
