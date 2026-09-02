-- ===========================================================================
-- Who is `created_by`?
--
-- Every quality record stamps `auth.uid()` into created_by / recorded_by /
-- reported_by, and the tables show that raw UUID: Material Returns reads
-- "6680c358-d798-41d0-8f1d-fd543a1c96c5" where it should read "Rithi Admin".
-- The name lives in `profiles`, but its read policy is
--   id = auth.uid() or is_admin() or has_perm('users.manage')
-- so an engineer can only ever resolve their own id — which is why the app
-- cannot do the lookup client-side today.
--
-- `app_user_names` is the narrowest thing that fixes it: id -> display name,
-- and nothing else. No email, no role, no manager, no permissions. Every
-- signed-in user may read it, which discloses no more than `user_directory`
-- (0004) already does — that lists everyone's name to any authenticated user.
--
-- READ-ONLY BY CONSTRUCTION. The RLS bypass lives in a SECURITY DEFINER
-- function and the view merely selects from it, which makes the view
-- non-auto-updatable: no INSERT / UPDATE / DELETE can be routed through it into
-- `profiles`, whatever privileges Supabase's default grants hand out. A plain
-- `select ... from profiles` view would have been auto-updatable and, running
-- as its owner, would have let any signed-in user rewrite or delete every
-- profile row straight past the policy above. The grants below are belt to that
-- braces, not the mechanism.
-- ===========================================================================

create or replace function public.app_user_names_rows()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email, '')
    from public.profiles p;
$$;
-- EXECUTE is checked against the CALLER even inside a view that runs as its
-- owner (owner rights cover table access, not function execute), so the reader
-- needs it. It hands out exactly what the view does — id and name — so this is
-- the same disclosure, not a wider one. anon gets neither.
revoke all on function public.app_user_names_rows() from public, anon;
grant execute on function public.app_user_names_rows() to authenticated;

create or replace view public.app_user_names as
  select id, name from public.app_user_names_rows();

revoke all on public.app_user_names from public, anon, authenticated;
grant select on public.app_user_names to authenticated;
