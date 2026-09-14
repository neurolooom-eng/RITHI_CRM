-- ===========================================================================
-- ProdHistory_04 — THE SCREEN'S PERMISSION KEY.
--
-- RUN THIS ON THE LIVE PROJECT (issxxmgsffszqbxugqis) — the only file in this
-- set that does. It touches `app_roles` and nothing else: the archive holds no
-- roles, and the live project holds no history.
--
-- Product History is a READ of two databases and a write of neither, so there
-- is one key and it is a module key: `mod:/product-history`. No rights beneath
-- it, because there is no action on the screen to grant.
--
-- ── Who gets it ────────────────────────────────────────────────────────────
--
-- Whoever can already open Product & Party Search. That screen answers "whose
-- machine is this, and what else have they got"; this one answers "and what
-- has happened to it" — the same question with the time axis added, asked by
-- the same desk, about a machine they can already see. Anyone who can be shown
-- the machine can be shown its past.
--
-- GRANTED BY MERGING, never by overwriting. An admin may have tuned a role
-- since it was seeded, and `has_perm` falls back to the engineer defaults only
-- when a role's row has ZERO permissions — so a role with some permissions and
-- not this one silently cannot open the page, while a role whose row this file
-- REPLACED would silently lose everything else. Additive, always.
--
-- Idempotent: the `not ... ?` guard means running it twice adds nothing and
-- running it after an admin has removed the key does not put it back.
-- ===========================================================================

update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/product-history"]'::jsonb,
       updated_at  = now()
 where coalesce(permissions, '[]'::jsonb) ? 'mod:/lookup'
   and not coalesce(permissions, '[]'::jsonb) ? 'mod:/product-history';

-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--
-- It does not create a table, a view or a policy on the live project, and the
-- screen needs none: the live half of a machine's history is read through the
-- registers that already exist (`calls`, `reports`, `spare_consumption`,
-- `products`), under the policies that already govern them. A visit somebody
-- may not see on the Visit Reports register is a visit they do not see here
-- either — the timeline inherits the rule instead of restating it, and a rule
-- restated in a second place is a rule that drifts.
--
-- ── Check it landed ────────────────────────────────────────────────────────
--
--   select role, permissions ? 'mod:/product-history' as has_key
--     from public.app_roles order by role;
--
-- A role showing false either has no `mod:/lookup` (it was never meant to have
-- this) or was edited by an administrator. Tick it on Roles & Permissions
-- rather than re-running this file.
-- ---------------------------------------------------------------------------
