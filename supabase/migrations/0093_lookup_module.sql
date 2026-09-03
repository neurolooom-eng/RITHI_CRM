-- ===========================================================================
-- The Product & Party Search screen, for whoever already has the Product Master.
--
-- A new module is in the code's defaults, but `has_perm` reads the STORED list
-- on `app_roles` and only falls back to those defaults when the row is empty —
-- so a role that has ever been saved in Roles & Permissions would not see the
-- screen at all. Granted here, by MERGING, so an administrator's other edits
-- are untouched.
--
-- The rule is simple: it reads exactly what Product Master reads — the install
-- base and the party it belongs to — from the other end. Anyone who may open
-- one may open the other. No new data is exposed, and row-level security
-- answers for the rows either way.
-- ===========================================================================

update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/lookup"]'::jsonb,
       updated_at  = now()
 where (role = 'admin' or coalesce(permissions, '[]'::jsonb) ? 'mod:/product-master')
   and not coalesce(permissions, '[]'::jsonb) ? 'mod:/lookup';
