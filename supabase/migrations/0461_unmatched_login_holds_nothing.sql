-- ===========================================================================
-- D-172 (re-review 5; the user's decision, 2026-10-14: "Nothing until added").
-- A REGRESSION OF D-074: a sign-in whose email is on no User Master row was
-- given an ENGINEER profile the first time it signed in.
--
-- sbCurrentProfile() calls ensure_my_profile() for every login with no
-- profile, and the function (0033) inserted coalesce(<the User Master role>,
-- 'engineer') whether or not a User Master row matched -- so D-074's "an
-- unknown login holds nothing" path ran only when the call failed. Measured: a
-- login with no profile and no User Master row went from has_perm(calls.report)
-- = false to true on its first sign-in.
--
-- From here the function makes a profile ONLY from a User Master row that
-- carries the login's email or gmail. With none it creates nothing and returns
-- NULL; the client then shows the one "not set up" page and the database holds
-- the login to nothing (0300) until an administrator adds the person to the
-- User Master. Profiles already created this way are left as they are (the
-- user's decision); supabase/apply/_profiles_without_a_user_master_row.sql
-- lists them.
--
-- Restated from 0033 (the latest definition); only the early return is new.
-- ===========================================================================
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql security definer set search_path = public as $$
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
   where mail <> '' and (lower(email) = mail or lower(gmail) = mail)
   limit 1;
  -- 0461 (D-172): no User Master row, no profile -- and so no permission.
  if not found then return null; end if;

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
