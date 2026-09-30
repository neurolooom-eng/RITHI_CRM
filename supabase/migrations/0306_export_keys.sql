-- ===========================================================================
-- DATA EXPORT HAS TWO KEYS: export.tables AND export.schedules.
-- WHAT WAS AN ADMINISTRATOR'S ALONE IS A KEY (the user, 2026-09-30: "All
-- Admin Actions that are greyed out now should be editable from the Role &
-- Permissions. Only the Admin Role should be Greyed out not the Actions.")
--
-- is_admin() becomes has_perm(<key>). An administrator still passes -- has_perm()
-- answers true for is_admin() -- so nobody loses anything, and NOBODY ELSE GAINS
-- ANYTHING ON THE DAY: no role holds the new key until an administrator ticks it
-- on Roles & Permissions. coalesce(..., false) so a NULL (no session) refuses.
--
-- The list of tables answers to either -- a schedule is made from ticked
-- tables. A download still runs AS THE PERSON, so it holds only the rows
-- their policies let them read. A schedule is mailed by the server to the
-- recipients set there, never to an address chosen on the screen, so the key
-- lets its holder decide WHAT and WHEN, not WHERE.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.exportable_tables()
 RETURNS TABLE(table_name text, approx_rows bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.relname::text,
         greatest(c.reltuples, 0)::bigint
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and public.is_exportable_table(c.relname)
     and (coalesce(public.has_perm('export.tables'), false) or coalesce(public.has_perm('export.schedules'), false))
   order by c.relname;
$function$;

drop policy if exists export_schedules_admin on public.export_schedules;
create policy export_schedules_admin on public.export_schedules for all
  using ((select public.has_perm('export.schedules')))
  with check ((select public.has_perm('export.schedules')));

drop policy if exists export_runs_read on public.export_runs;
create policy export_runs_read on public.export_runs for select
  using ((select public.has_perm('export.schedules')));
