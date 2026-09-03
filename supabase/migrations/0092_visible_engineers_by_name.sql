-- ===========================================================================
-- A REPORTING MANAGER WHO SEES NOTHING, WHILE THE SCREEN SAYS "15 engineers".
--
-- Two implementations of one rule, disagreeing:
--
--   * the CLIENT finds the signed-in person in the User Master by their email,
--     their gmail OR their username, then walks the reporting tree — which is
--     how the header can say "Team view · 15 engineers";
--   * `visible_engineer_names()` matches on email or gmail and NOTHING ELSE.
--     A User Master row whose address has gone stale (or who signs in with a
--     different one) resolves to no row, so the tree is empty and the database
--     returns no calls at all. The screen names a team it cannot read.
--
-- So the lookup falls back to the person's NAME, from their own profile — the
-- name the User Master is keyed on everywhere else in this system. It is a
-- FALLBACK, not a widening: when the address matches, nothing changes, and the
-- name is only consulted when it resolves to no row at all.
-- ===========================================================================

create or replace function public.visible_engineer_names()
returns setof text language sql stable security definer set search_path = public as $$
  with recursive me as (
    select name from public.user_directory
     where lower(email) = lower(auth.email()) or lower(gmail) = lower(auth.email())
  ),
  -- Only when the address finds nobody: the name on the caller's own profile.
  me_by_name as (
    select d.name from public.user_directory d
      join public.profiles p on p.id = auth.uid()
     where not exists (select 1 from me)
       and lower(btrim(d.name)) = lower(btrim(coalesce(p.full_name, '')))
       and btrim(coalesce(p.full_name, '')) <> ''
  ),
  root as (
    select name from me
    union
    select name from me_by_name
  ),
  tree as (
    select d.name from public.user_directory d where d.name in (select name from root)
    union
    select c.name from public.user_directory c
      join tree t
        on lower(c.reporting_manager) = lower(t.name)
        or lower(c.regional_manager)  = lower(t.name)
  )
  select name from tree where coalesce(name,'') <> '';
$$;
