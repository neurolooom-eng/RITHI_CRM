-- ===========================================================================
-- STORES INCHARGE AND SPARE COORDINATOR SEE EVERY ROW.
--
--   The user, 2026-09-18: "data.view_all --- Stores In Charge, Spare
--   Co-ordinator should be able to view all Rows. Fix this."
--
-- EXACTLY TWO ROLES. Commercial was named in the same message as a module the
-- user is working on, NOT as a role to grant, so it is not touched here. Nor is
-- anything else: the standing rule is that Regional Manager, Reporting Manager
-- and Engineer are as the user set them.
--
-- MERGE, NEVER OVERWRITE. The permissions column is rebuilt as the union of
-- what is already there and the one new key, so a role an administrator has
-- tuned keeps every tick. Re-running changes nothing.
--
-- A ROLE WITH ZERO PERMISSIONS IS LEFT ALONE. An empty array means "not
-- configured", and `has_perm()` falls back to the engineer defaults only while
-- it stays empty — writing one key into it would silently switch that fallback
-- off and take away everything else the role could do.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES AND DOES NOT CHANGE — read this before judging it by the
-- screen afterwards.
--
-- Both roles ALREADY pass `can_view_all_calls()`, which names them directly:
--
--     ... or exists (select 1 from profiles p where p.id = auth.uid()
--                     and lower(p.role) in ('hotline','nsm','commercial',
--                         'spare_coordinator','stores_incharge','tally_coordinator'))
--
-- and every policy in this database that consults `data.view_all` consults
-- `can_view_all_calls()` as well — checked, all three of them
-- (handstock_opening, spare_consumption_history, spare_issue_history). There is
-- no policy anywhere where this permission is the only way in.
--
-- SO THE GRANT IS BELT AND BRACES, and it is worth having for exactly that
-- reason: it makes the intent explicit on the Roles & Permissions screen, and
-- it keeps working if somebody is given a role KEY that is not one of the six
-- names hard-coded in that function.
--
-- WHICH MEANS: IF ROWS ARE STILL MISSING AFTER THIS, THE PERMISSION WAS NOT THE
-- CAUSE. Both routes read the person's role from `profiles.role`
-- (`my_role()` lowercases and trims it), so somebody whose profile says
-- `stores` or `Stores Incharge` rather than `stores_incharge` matches NEITHER
-- the hard-coded list NOR this app_roles row. `_who_can_this_person_see.sql`
-- row 2 prints the value their profile actually holds.
-- ===========================================================================
do $$
declare
  n      int;
  who    text;
  missed text;
begin
  if to_regclass('public.app_roles') is null then
    raise notice '0213: app_roles is missing -- run rbac.sql first';
    return;
  end if;

  update public.app_roles ar
     set permissions = (
           select jsonb_agg(distinct p)
             from jsonb_array_elements(ar.permissions || '["data.view_all"]'::jsonb) p)
   where ar.role in ('stores_incharge', 'spare_coordinator')
     -- Not configured: leave it, so the engineer fallback keeps working.
     and jsonb_array_length(coalesce(ar.permissions, '[]'::jsonb)) > 0
     -- Idempotent: a role that already holds it is not rewritten.
     and not (ar.permissions ? 'data.view_all');
  get diagnostics n = row_count;

  select string_agg(ar.role || ' (' || jsonb_array_length(ar.permissions)::text || ' perms)',
                    ', ' order by ar.role)
    into who
    from public.app_roles ar
   where ar.role in ('stores_incharge', 'spare_coordinator')
     and ar.permissions ? 'data.view_all';

  -- SAY WHAT WAS NOT DONE, and why. A role that is absent, or that has zero
  -- permissions, is skipped by design above -- and a migration that skips
  -- silently is one somebody re-runs looking for an effect it never had.
  select string_agg(r.want || ': ' || r.why, '; ' order by r.want) into missed
    from (
      select w.want,
             case when ar.role is null then 'no such role on this project'
                  else 'zero permissions (not configured) -- left alone on purpose' end as why
        from (values ('stores_incharge'), ('spare_coordinator')) w(want)
        left join public.app_roles ar on ar.role = w.want
       where ar.role is null
          or jsonb_array_length(coalesce(ar.permissions, '[]'::jsonb)) = 0
    ) r;

  raise notice '0213: % role(s) granted data.view_all; now holding it: %',
    n, coalesce(who, 'none');
  if missed is not null then
    raise notice '0213: NOT granted -- %', missed;
  end if;
end $$;
