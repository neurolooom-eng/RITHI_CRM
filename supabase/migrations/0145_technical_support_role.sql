-- ===========================================================================
-- TECHNICAL SUPPORT — the Super Admin's reach, none of its writes.
--
-- The user, 2026-09-08: "Create a New Role 'Technical Support' - Map this Role
-- to All Modules and Mimic Super Admin - But with Read Only For now."
--
-- So the role holds EVERY module key, including the administration ones, and
-- exactly the actions that only READ. It is not a narrower admin: it is the
-- same field of view with nothing that changes a row.
--
-- WHAT MAKES IT READ-ONLY IS WHAT IT DOES NOT HOLD, not a flag. Every write in
-- this database is gated by an RLS policy naming the action it needs --
-- `calls.edit`, `masters.edit`, `spare.dispatch`, `users.manage`, and the rest.
-- A role holding none of them cannot write, whatever a screen offers it: the
-- refusal is Postgres's, not the browser's. That is also why the list below is
-- written out rather than filtered by a pattern -- `consumption.reconcile` and
-- `ownership.transfer` do not say "edit" either, and a rule that went by the
-- key's spelling would hand over both.
--
-- `data.view_all` is what makes the rest of it useful. Without it the role can
-- open every page and, on the call pages, sees only rows allotted to it --
-- which for a support login is nothing at all. can_view_all_calls() (0035)
-- already honours the permission, so no policy changes here.
--
-- `admin.view` is new: it opens the administration screens read-only. They
-- gated themselves on `users.manage` / `rbac.manage` -- the rights to CHANGE
-- what is on them -- so until now there was no way to let somebody look.
--
-- MERGED, NEVER OVERWRITTEN, like every other grant in this project: an
-- administrator may have tuned the role by the time this is replayed, and the
-- merge cannot widen it past read-only because nothing in the list writes.
-- ===========================================================================

do $ts$
declare
  -- Every module in src/lib/rbac.ts MODULES, admin ones included. Kept as a
  -- literal list because the database has no other record of what the app's
  -- pages are; a page added later is added here too (and the union below means
  -- anything the admin role has gained meanwhile comes along by itself).
  all_mods text[] := array[
    'mod:/','mod:/lookup','mod:/daily-review','mod:/parties','mod:/product-master',
    'mod:/user-master','mod:/parts','mod:/masters','mod:/service-manuals','mod:/qms',
    'mod:/warranties','mod:/contracts','mod:/ownership-transfer','mod:/request-registration',
    'mod:/pending-registrations','mod:/field-calls','mod:/installations','mod:/pm-calls',
    'mod:/pending-calls','mod:/reports','mod:/report-mapping','mod:/bulk-uploads',
    'mod:/spare-requests','mod:/spare-rm-approval','mod:/spare-dispatch','mod:/spare-consumption',
    'mod:/handstock','mod:/mrn','mod:/stock-transfer','mod:/feedback','mod:/failure-report',
    'mod:/kpi','mod:/objective','mod:/exports','mod:/tracker','mod:/users','mod:/roles',
    'mod:/audit','mod:/admin-config','mod:/settings','mod:/version-history'];
  -- READ ONLY. Nothing here changes a row.
  read_only text[] := array[
    'calls.view','masters.view','consumption.view','reports.view','dashboard.view',
    'feedback.view','audit.view','admin.view','export.data','data.view_all'];
  granted jsonb;
begin
  if to_regclass('public.app_roles') is null then
    raise notice 'app_roles is missing -- run rbac.sql first';
    return;
  end if;

  -- The module keys the ADMIN role actually holds, so a page added to the admin
  -- role by a later migration reaches Technical Support without this file being
  -- edited. Union, not replacement: the literal list above is the floor.
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb) into granted
    from (
      select unnest(all_mods) as v
      union
      select unnest(read_only)
      union
      select m.v
        from public.app_roles ar,
             lateral jsonb_array_elements_text(ar.permissions) as m(v)
       where ar.role = 'admin'
         and m.v like 'mod:%'
    ) u;

  if exists (select 1 from public.app_roles r where r.role = 'technical_support') then
    -- MERGE. Whatever an administrator has since ticked stays ticked, and the
    -- merge cannot widen the role past read-only because nothing in `granted`
    -- writes.
    update public.app_roles r
       set permissions = (
             select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
               from (
                 select e.v from jsonb_array_elements_text(r.permissions) as e(v)
                 union
                 select g.v from jsonb_array_elements_text(granted) as g(v)
               ) m
           ),
           label      = coalesce(nullif(r.label, ''), 'Technical Support'),
           updated_at = now()
     where r.role = 'technical_support';
  else
    insert into public.app_roles (role, label, permissions)
    values ('technical_support', 'Technical Support', granted);
  end if;

  raise notice 'Technical Support: % permission(s) -- every module, read-only actions only',
    jsonb_array_length(granted);
end $ts$;

-- ---------------------------------------------------------------------------
-- ADMIN GETS `admin.view` TOO, so the matrix does not show the Super Admin
-- missing a right it obviously holds. is_admin() short-circuits has_perm(), so
-- this changes nothing about what an admin can do -- it keeps the row honest.
-- ---------------------------------------------------------------------------
update public.app_roles ar
   set permissions = (
         select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
           from (
             select jsonb_array_elements_text(ar.permissions) as v
             union
             select 'admin.view' as v
           ) u
       ),
       updated_at = now()
 where ar.role = 'admin'
   and not (ar.permissions ? 'admin.view');
