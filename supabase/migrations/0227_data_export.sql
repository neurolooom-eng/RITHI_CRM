-- ===========================================================================
-- DATA EXPORT — WHICH TABLES ARE THERE, AND HOW BIG.
--
-- The user, 2026-09-22: "I need to Export CSV only. Maybe I can select the
-- Tables."
--
-- THAT ASK IS SAFER THAN THE ONE IT REPLACES, and materially so. The earlier
-- shape -- every table, on a schedule, posted to a URL held in a settings row
-- -- was refused as an exfiltration primitive, and the refusal was right: a
-- destination an administrator can edit means the whole customer base can be
-- redirected to anywhere, silently, nightly. A person choosing tables and
-- downloading them is a different act with a different blast radius.
--
-- SO THE ROWS ARE READ BY THE BROWSER, THROUGH RLS, AS THE PERSON SIGNED IN.
-- Nothing here reads data. This function returns only NAMES and ROW COUNTS, so
-- the screen can show "products — 19,253 rows" before anybody downloads
-- anything, and an export shows exactly what that person is entitled to see.
--
-- The counts are ESTIMATES from the planner's statistics, not count(*). A
-- count(*) over sixty tables to paint a picker would scan the database every
-- time the screen opens, which is the Hand Stock timeout (0099) all over
-- again. An estimate is right for "is this big?" and the screen says it is an
-- estimate rather than printing a number that looks exact and is not.
-- ===========================================================================

create or replace function public.exportable_tables()
returns table (table_name text, approx_rows bigint)
language sql stable security definer set search_path = public as $$
  select c.relname::text,
         greatest(c.reltuples, 0)::bigint
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'v', 'm')
     -- The audit trails are not exported from a screen. They are the record of
     -- what everyone did, they are large, and a copy of them on somebody's
     -- laptop is a liability rather than a backup.
     and c.relname not in ('audit_log', 'record_audit', 'audit_mode_changes')
     and public.is_admin()
   order by c.relname;
$$;

grant execute on function public.exportable_tables() to authenticated;

comment on function public.exportable_tables() is
  'Names and ESTIMATED row counts of the public tables and views an administrator may export. Returns no data of any kind, and returns nothing at all to a caller who is not an administrator.';

-- ---- the screen's key ------------------------------------------------------
-- MERGED, NEVER OVERWRITTEN, into `admin` AND `technical_support`. The second
-- is not a choice: `_status.sql` row 114 asserts a PROPERTY this system already
-- maintains -- Technical Support holds every module key the admin does -- and
-- granting to admin alone breaks it. Caught by the check rather than by
-- reading, which is what it is for. The standing rule is that roles are not
-- touched; adding a key to one role's array is the smallest
-- change that makes a new screen reachable at all, and `permsForRole()` returns
-- the STORED set when it is non-empty, so without this the screen would exist
-- and be invisible to everybody. A role holding ZERO permissions is left alone:
-- an empty array means "not configured" and writing one key into it would turn
-- the code defaults off.
do $$
begin
  if to_regclass('public.app_roles') is null then
    raise notice '0227: app_roles is missing — run rbac.sql first. The key is not granted.';
    return;
  end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(array['mod:/data-export']) as v
             ) u
         ),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/data-export');
end $$;
