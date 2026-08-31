-- ===========================================================================
-- The role a User Master row carries, and the profile it becomes.
--
-- Roles live on `profiles`, which only exists once a person has signed in — so
-- until now a new joiner could not be given a role in advance, and someone who
-- had never signed in could not be seen or edited anywhere in the app. The
-- User Master is where people are actually maintained, so the role belongs
-- there too:
--
--   • `user_directory.role` is the role to grant, set by an administrator on
--     the User Master screen.
--   • `ensure_my_profile()` turns that into a real profile the first time the
--     person signs in — name, designation and role taken from their directory
--     row, so they arrive with the access they were given rather than as a
--     bare engineer.
--
-- Changing the role of someone who has already signed in is a `profiles` edit
-- (User Access, or the same screen) — this only decides where a profile starts.
-- ===========================================================================

alter table public.user_directory add column if not exists role text default '';

comment on column public.user_directory.role is
  'RBAC role key (app_roles.role) granted when this person first signs in.';

-- ---------------------------------------------------------------------------
-- The address guard (0030_engineer_address_write.sql) lets a dispatcher fix an
-- address and nothing else. `role` is new, so it has to join the list of
-- columns they must leave alone — otherwise the door meant for an address
-- would hand out permissions.
-- ---------------------------------------------------------------------------
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
  or new.role              is distinct from old.role
  or new.extra             is distinct from old.extra then
    raise exception 'Only an administrator may edit the user directory; dispatch may set the address only';
  end if;
  if not public.has_perm('spare.dispatch') then
    raise exception 'RBAC: setting a delivery address requires the spare.dispatch permission';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- First sign-in: build the profile from the User Master row.
--
-- Nothing created a `profiles` row, so a person who signed in without one was
-- shown as a bare engineer and never appeared in User Access — invisible to
-- the very screen that assigns roles. This closes that: it runs for the caller
-- only (auth.uid()), and takes the role from their directory row.
--
-- SECURITY DEFINER, so the caller does not need write access to profiles; the
-- role it grants is whatever an administrator put on the directory row, and
-- only if the role matrix actually knows it — a typo grants nothing rather
-- than something unintended.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_my_profile()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  me   uuid := auth.uid();
  mail text := lower(coalesce(auth.email(), ''));
  dir  public.user_directory;
  p    public.profiles;
  want text;
begin
  if me is null then return null; end if;

  select * into p from public.profiles where id = me;
  if found then return p; end if;

  select * into dir from public.user_directory
   where lower(email) = mail or lower(gmail) = mail
   limit 1;

  want := nullif(btrim(coalesce(dir.role, '')), '');
  if want is not null and not exists (select 1 from public.app_roles where role = want) then
    want := null;  -- not a role the matrix knows: fall back rather than guess
  end if;

  insert into public.profiles (id, email, full_name, role, designation, active)
  values (
    me,
    coalesce(auth.email(), ''),
    coalesce(nullif(btrim(coalesce(dir.name, '')), ''), coalesce(auth.email(), '')),
    coalesce(want, 'engineer'),
    coalesce(dir.designation, ''),
    coalesce(dir.validity, true)
  )
  on conflict do nothing;   -- id or email already taken: leave what is there

  select * into p from public.profiles where id = me;
  return p;   -- null if the email belongs to another profile; the caller copes
end $$;

revoke all on function public.ensure_my_profile() from public;
grant execute on function public.ensure_my_profile() to authenticated;
