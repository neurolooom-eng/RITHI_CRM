-- ===========================================================================
-- An engineer's delivery address.
--
-- The Declaration form that travels with the parcel ("TO WHOMSOEVER IT MAY
-- CONCERN") addresses it to the engineer. The User Master is where that
-- belongs — its sheet already has ADDRESS / CITY / STATE / Contact No columns,
-- and the User Master screen already shows City, State and Contact — but
-- user_directory never carried them, so on Supabase those columns were blank
-- and the form had nothing to read.
--
-- The four join the directory row, beside the name every other module already
-- refers to an engineer by, so one address serves every future document.
--
-- It ships in the RBAC bundle rather than the User Directory one, even though
-- the columns belong to the directory: the policy below calls has_perm(),
-- which RBAC defines and which applies after the directory.
--
-- Writing them is deliberately NOT admin-only. The person who finds out an
-- address is wrong is the one packing the parcel, so anyone who can dispatch
-- may correct it — and ONLY it: the guard below refuses every other column
-- from a non-admin, so the reporting tree (which drives who can see whose
-- calls) cannot be edited through this door.
-- ===========================================================================

alter table public.user_directory
  add column if not exists address text default '',
  add column if not exists city    text default '',
  add column if not exists state   text default '',
  add column if not exists phone   text default '';

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

-- A directory imported before these were columns put them in `extra` (the
-- in-app importer kept every unmapped sheet column there). Lift them across,
-- so an existing deployment does not have to re-import to address a parcel.
-- The guard is dropped first: this is a data migration, not somebody editing
-- the directory, and auth.uid() is NULL in the SQL editor.
drop trigger if exists user_directory_address_guard on public.user_directory;

update public.user_directory u
   set address = coalesce(nullif(btrim(u.address), ''),
                          nullif(btrim(u.extra ->> 'ADDRESS'), ''),
                          nullif(btrim(u.extra ->> 'Address'), ''), ''),
       city    = coalesce(nullif(btrim(u.city), ''),
                          nullif(btrim(u.extra ->> 'CITY'), ''),
                          nullif(btrim(u.extra ->> 'City'), ''), ''),
       state   = coalesce(nullif(btrim(u.state), ''),
                          nullif(btrim(u.extra ->> 'STATE'), ''),
                          nullif(btrim(u.extra ->> 'State'), ''), ''),
       phone   = coalesce(nullif(btrim(u.phone), ''),
                          nullif(btrim(u.extra ->> 'Contact  No'), ''),
                          nullif(btrim(u.extra ->> 'Contact No'), ''),
                          nullif(btrim(u.extra ->> 'Contact'), ''), '')
 where u.extra <> '{}'::jsonb;

create trigger user_directory_address_guard
  before update on public.user_directory
  for each row execute function public.user_directory_address_guard();
