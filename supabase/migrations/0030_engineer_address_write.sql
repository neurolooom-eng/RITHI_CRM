-- ===========================================================================
-- Who may set an engineer's delivery address.
--
-- The columns are the User Master's (0029_engineer_address.sql). This is only
-- the rule about writing them, and it ships with RBAC because its policy calls
-- has_perm(), which RBAC defines and which applies after the User Directory.
--
-- Writing them is deliberately NOT admin-only. The person who finds out an
-- address is wrong is the one packing the parcel, so anyone who can dispatch
-- may correct it — and ONLY it: the guard refuses every other column from a
-- non-admin, so the reporting tree (which drives who can see whose calls)
-- cannot be edited through this door.
-- ===========================================================================

create or replace function public.user_directory_address_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  -- Everything except the four address fields must be identical.
  if new.id                is distinct from old.id
  or new.name              is distinct from old.name
  or new.email             is distinct from old.email
  or new.gmail             is distinct from old.gmail
  or new.designation       is distinct from old.designation
  or new.reporting_manager is distinct from old.reporting_manager
  or new.regional_manager  is distinct from old.regional_manager
  or new.region            is distinct from old.region
  or new.validity          is distinct from old.validity
  or new.extra             is distinct from old.extra then
    raise exception 'Only an administrator may edit the user directory; dispatch may set the address only';
  end if;
  if not public.has_perm('spare.dispatch') then
    raise exception 'RBAC: setting a delivery address requires the spare.dispatch permission';
  end if;
  return new;
end $$;

drop trigger if exists user_directory_address_guard on public.user_directory;
create trigger user_directory_address_guard
  before update on public.user_directory
  for each row execute function public.user_directory_address_guard();

-- The policy lets a dispatcher through; the guard above decides what they may
-- actually change. (0004's ud_admin_write still covers admins for everything.)
drop policy if exists ud_address_update on public.user_directory;
create policy ud_address_update on public.user_directory for update
  using (public.is_admin() or public.has_perm('spare.dispatch'))
  with check (public.is_admin() or public.has_perm('spare.dispatch'));
