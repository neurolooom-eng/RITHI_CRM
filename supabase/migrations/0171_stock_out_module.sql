-- ===========================================================================
-- 0171 — STOCK OUT IS A PAGE, so it needs a permission of its own.
--
-- The user, 2026-09-12: "Add a Separate Page as Stock Out - the same FlatList
-- under Pending Dispatch", and with it "Match the Roles and Permissions as per
-- the Re-arrangement."
--
-- The list was a TAB on Pending Dispatch, so the right to read it was the right
-- to open that queue — one key for two different questions. Splitting them is
-- the point of the move: Commercial chasing a DC and a Reporting Manager
-- checking what an engineer was sent both want the record of what WENT OUT, and
-- neither has any business in the Stores queue.
--
-- NOBODY LOSES ANYTHING TODAY. Every role that can open Pending Dispatch is
-- given the new key, so the tab they were reading yesterday is the page they
-- read tomorrow. From here on the two can be granted apart, which they could
-- not be before.
--
-- MERGED, NEVER OVERWRITTEN (CLAUDE.md, and the reason is in 0126): an
-- administrator may have tuned a role, and a grant that replaces the array
-- silently throws that away. `permissions ? 'x'` is the jsonb "contains this
-- key" test, so this touches only the roles that actually hold the old key.
--
-- A ROLE WITH NO PERMISSIONS AT ALL IS NOT TOUCHED, and that is correct rather
-- than an oversight: an empty array means "not configured", and has_perm()
-- falls back to the code defaults for it (which carry every non-admin module,
-- this one included). Writing one key into that row would turn the fallback OFF
-- and leave the role holding exactly one permission — the "role that sees
-- NOTHING" fault in CLAUDE.md, caused by the fix for it.
-- ===========================================================================

update public.app_roles ar
   set permissions = (
         select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
           from (
             select jsonb_array_elements_text(ar.permissions) as v
             union
             select 'mod:/stock-out' as v
           ) u
       ),
       updated_at = now()
 where ar.permissions ? 'mod:/spare-dispatch'
   and not (ar.permissions ? 'mod:/stock-out');

-- ---------------------------------------------------------------------------
-- THE MENU MOVES NEED NO GRANT, and it is worth saying why rather than leaving
-- a reader to wonder what is missing.
--
-- A page's permission is `mod:<path>` — the PATH, not the heading it sits
-- under. Daily Call Review moving to Quality & Analytics, Call Review and
-- Customer Feedback to Service Calls, and the two bulk uploaders to
-- Administration change which heading they are listed beneath in the menu and
-- in the Roles & Permissions matrix; none of them changes a path, so no role
-- gains or loses access. The headings are how the matrix is READ, and matching
-- them to the menu is what stops an administrator granting the wrong row.
--
-- The two uploaders were `adminOnly` before the move and still are — their keys
-- (mod:/report-mapping, mod:/pm-bulk-upload) are unchanged, and administration
-- is where they now appear rather than a new right they now need.
-- ---------------------------------------------------------------------------
