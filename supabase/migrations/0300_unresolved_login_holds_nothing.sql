-- ===========================================================================
-- A LOGIN THE ORGANISATION DOES NOT KNOW HOLDS NO PERMISSION (D-074, FRS-210.5).
--
-- has_perm() takes the caller's role row and, when that row is empty or absent,
-- falls back to the ENGINEER permissions. For a person with a profile that is
-- the documented default ("an empty row means not configured"). For a person
-- with NO profile it meant this: anybody who could create a Supabase Auth
-- account -- with no profile and no User Master row -- held an engineer's write
-- authority through the API. my_role() returns NULL for them, no role row
-- matches NULL, and the fallback answered for them.
--
-- The client already signs such a person in only as "unresolved" and now gives
-- them nothing (src/lib/auth.tsx); this is the half that decides.
--
-- WHAT CHANGES: a SIGNED-IN caller with no profile row gets FALSE from every
-- has_perm(), unless they are a super administrator (app_super_admins, matched
-- by e-mail, as is_admin() already does).
--
-- WHAT DOES NOT:
--   * a caller WITH a profile -- same answer as 0286, the engineer fallback for
--     an empty role row included;
--   * no signed-in user at all (an import, a scheduled run, the SQL editor) --
--     the same expression as 0286, NULL included, because callers rely on
--     `if not has_perm()` being skipped there (0286's note).
-- FALSE, NOT NULL, for the unknown login: `if not has_perm(...) then raise` is
-- how the guards refuse, and NOT NULL is NULL, so a NULL here would have
-- WIDENED what an unknown login may do past the guards rather than narrowed it.
-- ===========================================================================

create or replace function public.has_perm(action text)
returns boolean language sql stable security definer set search_path = public as $$
  with role_row as (
    select r.permissions from public.app_roles r
     where r.role = public.my_role() and jsonb_array_length(coalesce(r.permissions, '[]'::jsonb)) > 0
  ),
  fallback as (
    select r.permissions from public.app_roles r where r.role = 'engineer'
  ),
  perms as (
    select permissions from role_row
    union all
    select permissions from fallback where not exists (select 1 from role_row)
  ),
  keys as (
    select action as k
    union all
    select pp.parent from public.perm_parents pp where pp.child = action
  )
  select case
    when auth.uid() is not null
     and not exists (select 1 from public.profiles p where p.id = auth.uid())
      then coalesce(public.is_super_admin(), false)
    else public.is_admin()
      or exists (select 1 from perms p, keys where p.permissions ? keys.k)
      or (select bool_or(public.my_extra_perms() ? keys.k) from keys)
  end;
$$;
grant execute on function public.has_perm(text) to authenticated;
