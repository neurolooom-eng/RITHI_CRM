-- ===========================================================================
-- 0308 — PART SEARCH CAN BE OPENED BY EVERY ROLE.
--
-- The user, 2026-10-01: "Create a Page under Overview - 'Part Search' ... It's
-- a Read only View - No Action Buttons or Edit Access for anyone - Including
-- Admin ... No Download Option as well." Asked who may open it: every role.
--
-- A NEW SCREEN IS NOT DONE UNTIL ROLES & PERMISSIONS KNOWS (0195): the code
-- default reaches only a role whose stored set is EMPTY, so without this the
-- page ships invisible to every configured role.
--
-- ONLY THE PAGE KEY. The screen offers no action, so there is nothing else to
-- grant; reading `parts` was already open to every signed-in user (0008
-- parts_read), and writing it stays masters.edit.records on the Part Master.
--
-- MERGED, NEVER OVERWRITTEN; a role with no permissions at all is left alone
-- (an empty array means "not configured", and the code default already holds
-- the key). An administrator can untick it per role afterwards; a re-run only
-- adds it to a configured role that lacks it.
-- ===========================================================================

do $$
declare n int;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = ar.permissions || '["mod:/part-search"]'::jsonb,
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and not (ar.permissions ? 'mod:/part-search');
  get diagnostics n = row_count;
  raise notice '0308: % role(s) given Part Search', n;
end $$;
