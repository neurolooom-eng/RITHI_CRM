-- ===========================================================================
-- SLA / OBJECTIVE CONFIGURATION TO TECHNICAL SUPPORT, and the Frequent Failure
-- rule onto that page.
--
-- The user, 2026-10-04: "Grant the page to Technical Support as well, Move
-- Frequent Failure -- the rule Review 2 applies also to this Page".
--
-- THE PAGE KEY ONLY. 0357 gave it to the Admin role with every action; this
-- gives Technical Support the PAGE and nothing else, so the cards read as
-- they do for every Technical Support view of an admin page -- read-only --
-- until an administrator ticks "Admin config" (SLA targets, Frequent Failure)
-- or "Edit, recalculate and cut off the quality objectives" (the Product
-- Failure rule) for the role on Roles & Permissions. With it, Technical
-- Support again holds every page key the Admin does, which is what
-- _status.sql row 114 asserts of that role; 0357's named exception there is
-- withdrawn in the same change.
--
-- The Frequent Failure card moving is a screen change only: its rule, table
-- and permission (config.manage) are unchanged.
--
-- MERGED, never overwritten; a role with no stored permissions is left alone.
-- ===========================================================================
do $$
declare n int;
begin
  if to_regclass('public.app_roles') is null then
    raise notice '0358: app_roles is missing -- run rbac.sql first. The key is not granted.';
    return;
  end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select 'mod:/sla-objective-config'
             ) u
         ),
         updated_at = now()
   where ar.role = 'technical_support'
     and jsonb_array_length(ar.permissions) > 0
     and not (ar.permissions ? 'mod:/sla-objective-config');
  get diagnostics n = row_count;
  raise notice '0358: % of 1 role (technical_support) given mod:/sla-objective-config', n;
end $$;
