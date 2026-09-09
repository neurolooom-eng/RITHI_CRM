-- ===========================================================================
-- ZOHO MIGRATION — Technical Support's twin, for as long as the migration runs.
--
-- The user, 2026-09-09: "Add one more Role called ZohoMigration, Use Technical
-- Support as the Cloning Role, Add this to all the Modules, Pages, Sub Pages,
-- Actions."
--
-- CLONED FROM THE STORED ROW, not from a copy of its list. 0145 had to write
-- its module list out by hand because nothing in the database knew what the
-- app's pages were; this one does not, because `technical_support` is already
-- sitting there holding the answer -- INCLUDING whatever an administrator has
-- ticked onto it since, and every page added after 0145 was written. A second
-- literal list would be a second thing to keep in step, and the two would
-- diverge the first time somebody edited one.
--
-- SUB-PAGES ARE GRANTED EXPLICITLY even though they would be INHERITED.
-- `parentAction()` already makes `mod:/exports` cover every report and
-- `mod:/masters` cover every value list, so the role would work without this.
-- But the ask names sub-pages, and Roles & Permissions shows a row per
-- sub-page: a screen where the boxes are empty and access nevertheless works
-- is a screen nobody can use to answer "what can this role open?". The master
-- lists are read from `masters` rather than listed, since they are data.
--
-- WHY A SEPARATE ROLE AT ALL, rather than pointing the migration at Technical
-- Support: this one ends when the migration does. Keeping them apart means
-- revoking it is one tick and leaves the support login untouched -- and the
-- audit trail says which of the two did a thing.
--
-- READ-ONLY, by the same mechanism as Technical Support and for the same
-- reason: every write in this database is gated by an RLS policy naming the
-- action it needs, and this role holds none of them. A migration reads
-- everything and writes nothing HERE -- what it writes goes into Zoho. The
-- refusal, if a screen ever offers it a button, is Postgres's and not the
-- browser's.
--
-- MERGED, NEVER OVERWRITTEN, like every grant in this project.
-- ===========================================================================

do $zm$
declare
  granted jsonb;
  n_mods  integer;
begin
  if to_regclass('public.app_roles') is null then
    raise notice 'app_roles is missing -- run rbac.sql first';
    return;
  end if;

  if not exists (select 1 from public.app_roles where role = 'technical_support') then
    -- The clone source has to exist. Inventing a fallback list here is how the
    -- two roles would end up differing, which is the one thing this file is
    -- built to prevent.
    raise notice 'technical_support is not there yet -- run 0145 (rbac.sql) first, then this';
    return;
  end if;

  select coalesce(jsonb_agg(distinct v), '[]'::jsonb) into granted
    from (
      -- 1. Everything Technical Support holds, as it stands right now.
      select m.v
        from public.app_roles ar, lateral jsonb_array_elements_text(ar.permissions) as m(v)
       where ar.role = 'technical_support'
      union
      -- 2. The report sub-pages, spelled out so the matrix shows them ticked.
      select unnest(array['mod:/exports/consumption','mod:/exports/kpi','mod:/exports/unused'])
      union
      -- 3. Every master value list that exists, same reason. Data, so derived.
      select 'mod:/masters/' || ml.name
        from (select distinct name from public.masters where coalesce(name,'') <> '') ml
    ) u;

  if exists (select 1 from public.app_roles r where r.role = 'zoho_migration') then
    update public.app_roles r
       set permissions = (
             select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
               from (
                 select e.v from jsonb_array_elements_text(r.permissions) as e(v)
                 union
                 select g.v from jsonb_array_elements_text(granted) as g(v)
               ) m
           ),
           label      = coalesce(nullif(r.label, ''), 'Zoho Migration'),
           updated_at = now()
     where r.role = 'zoho_migration';
  else
    insert into public.app_roles (role, label, permissions)
    values ('zoho_migration', 'Zoho Migration', granted);
  end if;

  select count(*) into n_mods
    from jsonb_array_elements_text(granted) as e(v) where e.v like 'mod:%';

  raise notice 'Zoho Migration: % permission(s), % module/page key(s) -- cloned from Technical Support, read-only',
    jsonb_array_length(granted), n_mods;
end $zm$;
