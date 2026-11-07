-- ===========================================================================
-- 0466 — THE STAFF NAME LIST IS FOR SOMEBODY ON THE USER MASTER
--        (security re-scan, 2026-11-07, F-11)
--
-- app_user_names (0068) maps every login to a display name -- the person's
-- full name, or their EMAIL where the profile has none -- for any signed-in
-- caller. The function behind it is owner-rights, so the restrictive "no
-- profile, no rows" policy (0464) never reaches it: a login with no profile,
-- which anybody can make while self sign-up is open, read the whole staff list
-- and some addresses. Measured on a database built from every migration.
--
-- The same function, answering only a caller who has a profile. Everybody who
-- uses RITHI has one, so nothing on any screen changes. In this module, after
-- 0068, so a re-run of user_directory.sql keeps the check.
-- ===========================================================================

create or replace function public.app_user_names_rows()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email, '')
    from public.profiles p
   where auth.uid() is not null
     and exists (select 1 from public.profiles me where me.id = auth.uid());
$$;
revoke all on function public.app_user_names_rows() from public, anon;
grant execute on function public.app_user_names_rows() to authenticated;
