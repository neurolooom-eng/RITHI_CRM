-- ===========================================================================
-- Office / coordination roles see every call.
-- Hotline, NSM, Commercial, Spare Coordinator, Stores Incharge and Tally
-- Coordinator are not tied to a call's allocation, so they should see all calls
-- (and, through the policies that reuse can_see_call, all reports / spares).
-- Engineers, RMs and RGMs stay scoped to their own / their sub-tree's calls.
-- ===========================================================================

-- True when the signed-in user's role is an office/coordination role (or admin).
create or replace function public.can_view_all_calls()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and lower(coalesce(p.role, '')) in
           ('hotline', 'nsm', 'commercial', 'spare_coordinator', 'stores_incharge', 'tally_coordinator')
  );
$$;
grant execute on function public.can_view_all_calls() to authenticated;

-- Fold the new bypass into can_see_call (used by calls / reports / spare policies).
create or replace function public.can_see_call(allottee text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_view_all_calls()
      or coalesce(allottee, '') = ''
      or lower(trim(allottee)) in (
           select lower(trim(n)) from public.visible_engineer_names() as v(n)
         );
$$;
