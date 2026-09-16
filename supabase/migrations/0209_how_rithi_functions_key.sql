-- ===========================================================================
-- "HOW RITHI FUNCTIONS" IS RESTRICTED TO FOUR ROLES.
--
-- The user, 2026-09-16: "How RITHI Functions - Limit Exposure to Admin, NSM,
-- Zoho, Technical Support."
--
-- The page shipped this morning as `alwaysOpen` — not a module at all, open to
-- everybody, like the two help pages beside it. It is a module now, with the
-- key `mod:/knowledge-base/how-it-works`, and this file is what makes that key
-- mean anything on a project in use.
--
-- REMOVING A MENU ENTRY DOES NOT RESTRICT A PAGE. The route still answers, and
-- anyone who has been sent the address still reaches it. The permission is the
-- restriction; the menu merely follows it.
--
-- AND A CODE DEFAULT REACHES NOBODY HERE. `permsForRole()` is
-- `if (stored && stored.length) return stored;` — the defaults apply ONLY to a
-- role whose stored set is EMPTY, and on a live project every role has a tuned
-- row. So ticking the box in `DEFAULT_PERMS` grants it to no one until this
-- runs. That is the standing rule this project has been bitten by four times,
-- and the direction is the same whether the change is widening or narrowing.
--
-- IT ONLY GRANTS. There is nothing to take away: the key is new, so no role
-- holds it, and the page's OLD state was "no key at all". A role not named
-- below simply never gains it — which is the restriction.
--
-- A ROLE WITH ZERO PERMISSIONS IS LEFT ALONE. An empty array means "not
-- configured" and the code defaults apply, which for those three of the four
-- already carry this key; writing one key into an empty row would turn that
-- fallback off and take everything else away.
-- ===========================================================================

do $$
declare n int;
begin
  if to_regclass('public.app_roles') is null then return; end if;

  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(array['mod:/knowledge-base/how-it-works']) as v
             ) u
         ),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'nsm', 'zoho_migration', 'technical_support')
     and not (ar.permissions ? 'mod:/knowledge-base/how-it-works');
  get diagnostics n = row_count;

  raise notice '0209: % of 4 role(s) given mod:/knowledge-base/how-it-works', n;

  -- SAID OUT LOUD, because the opposite of this grant is the point of the
  -- change: anybody else holding it would be a defect, and a migration that
  -- only reports what it added cannot show that.
  if exists (
    select 1 from public.app_roles
     where permissions ? 'mod:/knowledge-base/how-it-works'
       and role not in ('admin', 'nsm', 'zoho_migration', 'technical_support')
  ) then
    raise notice '0209: WARNING — a role outside the four holds this key. '
                 'Check Roles & Permissions; this file never granted it.';
  end if;
end $$;
