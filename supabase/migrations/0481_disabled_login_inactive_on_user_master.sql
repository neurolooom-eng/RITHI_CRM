-- ===========================================================================
-- 0481 -- DISABLING A LOGIN SETS THE PERSON INACTIVE ON USER MASTER (the user,
-- 2026-11-13: "Disabling a User Login should automatically set the User
-- Account to False in the "Active" Column in User Master.").
--
-- profiles_login_disable_sync: when a login's `active` goes to false -- the
-- Disable login button, or anything else that writes it -- every User Master
-- row of that address (Air Liquide ID or Gmail) gets Active (validity) = false.
-- One way only, as asked: enabling the login again does NOT re-activate the
-- User Master row; that is a decision somebody makes there.
--
-- The guard on user_directory (0033) lets only an administrator change a row
-- other than its address, and `users.manage.disable` -- which may disable a
-- login -- is not only an administrator's. So the trigger marks its own
-- change (a transaction-local setting) and the guard lets exactly that change
-- through: Active from true to false, every other column untouched. 0033's
-- guard otherwise word for word, read out of a database built from every
-- migration. No loop: the User Master -> login sync (0199) writes role, name
-- and designation only.
-- ===========================================================================

create or replace function public.user_directory_address_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.is_admin() then return new; end if;
  -- A LOGIN DISABLED SETS ACTIVE TO NO (0481): the change profiles_login_
  -- disable_sync makes on whoever disabled the login -- Active (validity) to
  -- false and nothing else -- is let through. Only that trigger sets the flag,
  -- for the length of its own statement's transaction.
  if coalesce(current_setting('rithi.login_disable_sync', true), '') = 'on'
     and old.validity is distinct from false and new.validity = false
     and (to_jsonb(new) - 'validity' - 'sys_updated_by' - 'sys_updated_on')
       = (to_jsonb(old) - 'validity' - 'sys_updated_by' - 'sys_updated_on') then
    return new;
  end if;
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
end $function$;

create or replace function public.profiles_login_disable_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active is distinct from false or old.active is not distinct from false then return null; end if;
  if btrim(coalesce(new.email, '')) = '' then return null; end if;
  perform set_config('rithi.login_disable_sync', 'on', true);
  update public.user_directory u
     set validity = false
   where u.validity is distinct from false
     and (lower(btrim(coalesce(u.email, ''))) = lower(btrim(new.email))
       or (btrim(coalesce(u.gmail, '')) <> '' and lower(btrim(u.gmail)) = lower(btrim(new.email))));
  perform set_config('rithi.login_disable_sync', '', true);
  return null;
end $$;
comment on function public.profiles_login_disable_sync() is
  'A login disabled (profiles.active -> false) sets its User Master rows inactive (0481). One way only.';
revoke execute on function public.profiles_login_disable_sync() from public, anon, authenticated;
drop trigger if exists profiles_login_disable_sync on public.profiles;
create trigger profiles_login_disable_sync after update of active on public.profiles
  for each row execute function public.profiles_login_disable_sync();
