-- ===========================================================================
-- A BLANK NAME IS NOT A MANAGER, AND MUST NOT MATCH ONE.
--
-- Reported from use (2026-09-18): "Why is a Regional Manager able to see
-- everyone's call and every spare request?"
--
-- `visible_engineer_names()` walks the directory DOWNWARDS from the caller —
-- everyone whose reporting_manager or regional_manager is the caller, then
-- everyone under them. The walk matched on name equality with nothing
-- excluding the EMPTY STRING from either side. So when the caller's own row in
-- `user_directory` has a blank `name` — which is what a partial import, a
-- trimmed cell or a directory row keyed only by email leaves — the recursion
-- asks for everyone whose manager is '' and gets every row that has no manager
-- recorded.
--
-- MEASURED, not reasoned about. A regional manager with three of his own and
-- five strangers, run before and after:
--
--   name present : ENG ONE, ENG TWO, ENG THREE, HARSH RM      <- correct
--   name blank   : ENG TWO, ENG THREE, STRANGER A, STRANGER B <- wrong BOTH ways
--
-- Note the second line carefully: it is not "sees everyone", it is worse than
-- that to diagnose. Two strangers are pulled IN, and one of his own team is
-- pushed OUT — because the root no longer matches the people who name him.
-- Nobody looking at that list could tell it was a fault rather than a region.
--
-- THE FIX IS ONE CONDITION, AND IT ONLY EVER NARROWS. A tree node with a blank
-- name stops recursing. A caller whose directory row has no name now sees no
-- team at all, which is the honest answer: the directory does not say who they
-- are, so it cannot say who reports to them. They still see their own calls
-- through the other branches of the read policy, which match on user id and
-- email rather than on name.
--
-- The comparison itself is left EXACTLY as it was. Adding btrim() to both
-- sides would also make ' HARSH RM ' match 'HARSH RM', and that is a WIDENING
-- — more rows visible, not fewer. It may well be wanted, but it is a different
-- decision from closing a leak and does not belong in the same change.
-- ===========================================================================
create or replace function public.visible_engineer_names()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
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
        -- THE GUARD. Without it, '' = '' and every unmanaged row joins the team.
        on btrim(coalesce(t.name, '')) <> ''
       and (lower(c.reporting_manager) = lower(t.name)
         or lower(c.regional_manager)  = lower(t.name))
  )
  select name from tree where coalesce(name,'') <> '';
$$;
