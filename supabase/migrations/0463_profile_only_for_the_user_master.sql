-- ===========================================================================
-- 0463 -- A LOGIN GETS A PROFILE ONLY IF THE USER MASTER NAMES IT (security
-- scan, 2026-10-27; docs/SECURITY_SCAN.md, F-02).
--
-- Found on the live project: self sign-up is open with no email confirmation,
-- and ensure_my_profile() -- which the app calls at every sign-in -- gave ANY
-- login a profile: its User Master role where the address was on the User
-- Master, and otherwise ENGINEER, active. So anybody on the internet could
-- make an account, sign in, and hold an engineer's rights. Two live profiles
-- were found on no User Master row (counted, not named, by
-- _who_can_sign_in.sql).
--
-- Now a profile is made only for an address on an ACTIVE User Master row --
-- "the User Master is the master" (0199). Anybody else stays an unresolved
-- login, which holds nothing (0300) and, with 0464, reads nothing. Existing
-- profiles are not touched: the two found are for the user to judge.
--
-- What this does NOT close, and the scan says so: with email confirmation off,
-- somebody who knows the address of a person on the User Master who has not
-- signed in yet could sign up with it. That needs "Confirm email" on in the
-- Supabase project -- the user's decision, since creating a login then needs
-- the new person to confirm their address.
-- ===========================================================================
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

  -- ONLY AN ACTIVE USER MASTER ROW makes a profile (0463).
  select * into dir from public.user_directory
   where mail <> '' and (lower(btrim(email)) = mail or lower(btrim(gmail)) = mail)
     and coalesce(validity, true)
   limit 1;
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
    true
  )
  on conflict do nothing;   -- id or email already taken: leave what is there

  select * into p from public.profiles where id = me;
  return p;   -- null if the email belongs to another profile; the caller copes
end $$;
revoke all on function public.ensure_my_profile() from public;
revoke execute on function public.ensure_my_profile() from anon;
grant execute on function public.ensure_my_profile() to authenticated;
