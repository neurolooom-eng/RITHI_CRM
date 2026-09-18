-- ===========================================================================
-- `data.view_all` FOR EVERY ROLE EXCEPT THREE.
--
--   The user, 2026-09-18: "data.view_all - Is applicable for all Roles Except -
--   Regional Manager , REporting Manager , Engineer."
--
-- This supersedes the narrower question left open after 0213 (whether
-- Commercial should have it): the answer is the RULE, not a list. So this
-- migration is written as the rule — grant to everything, subtract the three —
-- rather than as a list of the nine roles that happen to exist today. A list
-- would be right this week and silently wrong the moment a thirteenth role is
-- added, which is exactly how the analysis roles came to see nothing.
--
-- THE THREE ARE THE STANDING RULE, and they are the ones whose visibility is
-- SUPPOSED to be bounded by the reporting tree: a Regional Manager, a Reporting
-- Manager and an Engineer see their own work and their team's, through
-- `visible_engineer_names()`. Granting this to any of them is the bug reported
-- this morning — "Why is a Regional Manager able to see everyone's call and
-- every spare request?" — so the exclusion is the load-bearing half of this
-- file, not the grant.
--
-- WHICH IS WHY THE EXCLUSION IS DELIBERATELY GENEROUS AND THE GRANT IS NOT.
-- The two errors are not symmetrical: excluding a role that should have been
-- granted leaves somebody with fewer rows than intended, which is visible and
-- reversible by a tick on Roles & Permissions. Granting one that should have
-- been excluded hands a manager every region's data, reads as a different
-- region rather than as an error, and nobody reports it. So the exclusion
-- matches on the role key with case and punctuation SQUASHED and covers the
-- spellings each of the three is written in — `rgm`, `regional_manager`,
-- `RegionalManager` are one role here.
--
-- MERGE, NEVER OVERWRITE (0213's rule, and the project's). The permissions
-- column is rebuilt as the union of what is there and the one key, so a role an
-- administrator has tuned keeps every tick. Re-running changes nothing.
--
-- A ROLE WITH ZERO PERMISSIONS IS LEFT ALONE. An empty array means "not
-- configured", and `has_perm()` falls back to the engineer defaults only while
-- it stays empty — writing one key in would switch that fallback off and take
-- away everything else the role could do. It is reported rather than skipped
-- silently.
--
-- WHAT IT ACTUALLY CHANGES. `data.view_all` makes `can_view_all_calls()` true
-- for ANY role, so for the six office roles named inside that function
-- (hotline, nsm, commercial, spare_coordinator, stores_incharge,
-- tally_coordinator) this is belt and braces — they already passed. What it
-- genuinely widens is every OTHER non-excluded role on the project: the ones
-- not hard-coded in that function, including any this repository does not know
-- about. That is the ask, and it is worth saying out loud rather than
-- discovering.
--
-- AND IF A REGIONAL MANAGER ALREADY HOLDS IT, THIS FILE DOES NOT TAKE IT AWAY.
-- That would be editing one of the three roles the user has said twice not to
-- touch, and a permission removed by a migration is not something an
-- administrator can see was removed. It is REPORTED instead, in the notice
-- below, marked so it cannot be missed — removing it is then a decision
-- somebody makes, not one this file makes for them. (That is how a Regional
-- Manager came to see every region: `data.view_all` was ticked by hand on Roles
-- & Permissions; `_who_can_this_person_see.sql` tells that apart from the blank
-- name fault 0212 fixed.)
--
-- NO `_status.sql` ROW, DELIBERATELY. `app_roles` is EDITED by administrators,
-- so a row asserting "every non-excluded role holds this" would read NO the
-- first time somebody legitimately unticks one — and a NO that means nothing is
-- worse than no row, because it sends somebody to re-run a bundle already in.
-- Row 165 was exactly that mistake a week ago. The notices above are the
-- report; they print what is true at the moment it is run.
-- ===========================================================================
do $$
declare
  n        int;
  granted  text;
  skipped  text;
  excluded text;
begin
  if to_regclass('public.app_roles') is null then
    raise notice '0216: app_roles is missing -- run rbac.sql first';
    return;
  end if;

  update public.app_roles ar
     set permissions = (
           select jsonb_agg(distinct p)
             from jsonb_array_elements(ar.permissions || '["data.view_all"]'::jsonb) p)
   where regexp_replace(lower(coalesce(ar.role, '')), '[^a-z0-9]', '', 'g') not in (
           -- REGIONAL MANAGER
           'rgm', 'regionalmanager', 'regionmanager',
           -- REPORTING MANAGER
           'rm', 'reportingmanager', 'reportmanager',
           -- ENGINEER
           'engineer', 'engineers', 'fieldengineer', 'serviceengineer'
         )
     -- Not configured: leave it, so the engineer fallback keeps working.
     and jsonb_array_length(coalesce(ar.permissions, '[]'::jsonb)) > 0
     -- Idempotent: a role that already holds it is not rewritten.
     and not (ar.permissions ? 'data.view_all');
  get diagnostics n = row_count;

  select string_agg(ar.role, ', ' order by ar.role) into granted
    from public.app_roles ar
   where ar.permissions ? 'data.view_all';

  select string_agg(ar.role, ', ' order by ar.role) into skipped
    from public.app_roles ar
   where jsonb_array_length(coalesce(ar.permissions, '[]'::jsonb)) = 0;

  -- NAME THE EXCLUDED ONES EVERY RUN. This is the half somebody needs to be
  -- able to read back off the screen, and a migration that only reports what it
  -- changed cannot show that the three were deliberately left as they are.
  select string_agg(ar.role || case when ar.permissions ? 'data.view_all'
                                    then ' *** HOLDS data.view_all -- ticked by hand,'
                                         || ' this file does not remove it ***'
                                    else '' end,
                    ', ' order by ar.role) into excluded
    from public.app_roles ar
   where regexp_replace(lower(coalesce(ar.role, '')), '[^a-z0-9]', '', 'g') in (
           'rgm', 'regionalmanager', 'regionmanager',
           'rm', 'reportingmanager', 'reportmanager',
           'engineer', 'engineers', 'fieldengineer', 'serviceengineer');

  raise notice '0216: granted data.view_all to % role(s). Now holding it: %',
    n, coalesce(granted, 'none');
  raise notice '0216: EXCLUDED (left exactly as they are): %',
    coalesce(excluded, 'none of the three exist on this project');
  if skipped is not null then
    raise notice '0216: skipped, zero permissions (not configured, on purpose): %', skipped;
  end if;
end $$;
