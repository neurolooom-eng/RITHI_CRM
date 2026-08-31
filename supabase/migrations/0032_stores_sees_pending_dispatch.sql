-- ===========================================================================
-- Stores Incharge can open Pending Dispatch.
--
-- 0027 granted `mod:/spare-dispatch` only to roles whose stored permission
-- list already contained `spare.dispatch`. That is one condition too many: a
-- role's list is editable in Roles & Permissions, so any role whose entry had
-- been re-saved, seeded before 0008's matrix, or trimmed by an administrator
-- came out of that migration without the screen — while still being the role
-- that does the dispatching. Reported for Stores Incharge.
--
-- Granted by ROLE as well now, the way 0020_stock_transfer.sql grants the
-- transfer screen. The two conditions are OR'd, so a custom role that holds
-- spare.dispatch still gets it, and an administrator's later edits to any
-- other permission are untouched — this only ever appends.
--
-- Stores also needs the register itself to see what is coming, and the ability
-- to dispatch at all, so both are topped up for the same roles. Every clause
-- is additive and re-runnable.
-- ===========================================================================

-- 1. The action. A dispatch role that somehow lost it cannot book stock out.
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["spare.dispatch"]'::jsonb,
       updated_at  = now()
 where role in ('admin', 'stores_incharge', 'spare_coordinator')
   and not coalesce(permissions, '[]'::jsonb) ? 'spare.dispatch';

-- 2. The screen, for those roles and for anyone else holding the action.
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/spare-dispatch"]'::jsonb,
       updated_at  = now()
 where (role in ('admin', 'stores_incharge', 'spare_coordinator')
        or coalesce(permissions, '[]'::jsonb) ? 'spare.dispatch')
   and not coalesce(permissions, '[]'::jsonb) ? 'mod:/spare-dispatch';

-- 3. The spare register, so Stores can see what is on its way to them.
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/spare-requests"]'::jsonb,
       updated_at  = now()
 where (role in ('admin', 'stores_incharge', 'spare_coordinator')
        or coalesce(permissions, '[]'::jsonb) ? 'spare.dispatch')
   and not coalesce(permissions, '[]'::jsonb) ? 'mod:/spare-requests';
