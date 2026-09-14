-- ===========================================================================
-- 0192 — "PRODUCT MASTER" BECOMES "PRODUCT DATABASE", and the name is freed.
--
-- The user, 2026-09-14: "Rename Product Master to Product Database -- Deep dive
-- and Rename all instances." and, in the same breath, "Add a Separate Product
-- Master - Which is the Actual List of Product Lines".
--
-- So the two things swap names, and that is the whole difficulty:
--
--   `public.products`   the INSTALL BASE — one row per MACHINE, by model and
--                       serial, with its customer and its cover. Now labelled
--                       PRODUCT DATABASE, route /product-database.
--   (next migration)    the CATALOGUE — one row per PRODUCT LINE, with its
--                       code, type, category and whether it is still sold.
--                       That is the new PRODUCT MASTER.
--
-- THE TABLE IS NOT RENAMED. `products` is referenced by 24 views, a dozen
-- functions and every screen; renaming it would be a day's work with nothing
-- gained, because the NAME the user reads comes from the module label and not
-- from the table. What this file does is move the PERMISSION.
--
-- WHY THE PERMISSION HAS TO MOVE, and why it cannot simply be left alone:
-- the module key IS the route (`mod:/product-master`). If the new catalogue
-- took that route — which is the obvious thing to do, since it is now the
-- Product Master — then every role holding that key would SILENTLY STOP seeing
-- the install base and START seeing the catalogue. Same key, different screen,
-- no error and nothing on screen to explain it.
--
-- So the install base moves to `mod:/product-database` and KEEPS ITS AUDIENCE:
-- every role that could open it before can open it now. The catalogue's key is
-- NEW and is granted deliberately below, to the roles that maintain masters —
-- not inherited by accident from a key that used to mean something else.
--
-- MERGED, NEVER OVERWRITTEN (the standing rule): `has_perm` falls back to the
-- engineer defaults only when a role's permissions are EMPTY, so writing one
-- key into a role would turn that fallback off and leave it holding one thing.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE INSTALL BASE KEEPS ITS AUDIENCE under the new key.
-- ---------------------------------------------------------------------------
update public.app_roles ar
   set permissions = (
         select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
           from (
             select jsonb_array_elements_text(ar.permissions) as v
             union
             select 'mod:/product-database' as v
           ) u
       ),
       updated_at = now()
 where ar.permissions ? 'mod:/product-master'
   and not (ar.permissions ? 'mod:/product-database');

-- ---------------------------------------------------------------------------
-- 2. THE OLD KEY IS LEFT IN PLACE, deliberately.
--
-- It now means the CATALOGUE, and section 3 decides who gets that. Removing it
-- here would be the same silent change in the other direction — a role losing
-- something between one deploy and the next with nothing said. An
-- administrator who does not want a role reading the catalogue unticks it on
-- Roles & Permissions, where the change is visible and theirs.
--
-- The ones that keep it are the roles that maintain masters, which is what the
-- catalogue is. Every other role holding it will see a screen it did not have
-- before, and that is the one consequence worth stating out loud rather than
-- burying: the catalogue is a READ-ONLY LIST OF PRODUCT LINES. It carries no
-- customer, no serial and no cover, so nothing confidential moves with it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. AND THE ROLES THAT MAINTAIN MASTERS GET THE CATALOGUE EXPLICITLY, so it
--    is granted rather than merely left over.
-- ---------------------------------------------------------------------------
update public.app_roles ar
   set permissions = (
         select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
           from (
             select jsonb_array_elements_text(ar.permissions) as v
             union
             select 'mod:/product-master' as v
           ) u
       ),
       updated_at = now()
 where ar.permissions ? 'masters.view'
   and not (ar.permissions ? 'mod:/product-master');

do $$
declare n int;
begin
  select count(*) into n from public.app_roles where permissions ? 'mod:/product-database';
  raise notice '0192: % role(s) can open the Product Database (the install base) under its new key', n;
  select count(*) into n from public.app_roles where permissions ? 'mod:/product-master';
  raise notice '0192: % role(s) can open the Product Master (the product lines)', n;
end $$;
