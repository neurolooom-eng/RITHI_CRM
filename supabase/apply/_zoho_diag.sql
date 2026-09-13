-- ===========================================================================
-- WHY DOES "Zoho Migration: a read-only clone of Technical Support" READ NO?
--
-- READ-ONLY. Changes nothing. Run it in the Supabase SQL editor.
--
-- The status row fails on EITHER of two clauses, and they mean opposite
-- things, so the first job is to say WHICH:
--
--   A. DRIFT      -- technical_support holds a key zoho_migration does not.
--                    The clone has fallen behind its source. Harmless to the
--                    user (they see less), but the row is right to flag it.
--   B. NOT READ-ONLY -- zoho_migration holds one of the eight WRITE actions.
--                    This one matters: the role is supposed to be unable to
--                    change anything, and a write action means it can.
-- ===========================================================================
select 'A. present?' as clause,
       coalesce((select 'zoho_migration row exists' from public.app_roles
                  where role = 'zoho_migration'), 'MISSING -- rbac.sql has not run') as finding
union all
select 'A. drift', 'technical_support has, zoho_migration lacks: ' || m.v
  from public.app_roles ts, lateral jsonb_array_elements_text(ts.permissions) m(v)
 where ts.role = 'technical_support'
   and not exists (select 1 from public.app_roles zm
                    where zm.role = 'zoho_migration' and zm.permissions ? m.v)
union all
select 'B. write action', 'zoho_migration HOLDS the write action: ' || m.v
  from public.app_roles zm, lateral jsonb_array_elements_text(zm.permissions) m(v)
 where zm.role = 'zoho_migration'
   and m.v in ('calls.edit','masters.edit','users.manage','rbac.manage','spare.dispatch',
               'review.edit','cover.edit','consumption.reconcile')
union all
select 'counts', r.role || ' = ' || jsonb_array_length(r.permissions) || ' permissions'
  from public.app_roles r
 where r.role in ('admin','technical_support','zoho_migration')
order by 1, 2;
