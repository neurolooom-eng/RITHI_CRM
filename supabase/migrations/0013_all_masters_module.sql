-- ---------------------------------------------------------------------------
-- 0013 — All Masters module access.
--
-- The new /masters screen (every master the app reads, with its source, size
-- and values) is gated like any other module by `mod:/masters`. 0008 seeded the
-- role matrix with the modules that existed then and deliberately leaves an
-- existing role's permissions alone, so the new key is on no role. Append it —
-- additively — to every role that can already open a master register
-- (`mod:/parts`), without disturbing any permission an admin has since edited.
-- ---------------------------------------------------------------------------
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/masters"]'::jsonb,
       updated_at  = now()
 where coalesce(permissions, '[]'::jsonb) ? 'mod:/parts'
   and not coalesce(permissions, '[]'::jsonb) ? 'mod:/masters';
