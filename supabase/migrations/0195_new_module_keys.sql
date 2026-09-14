-- ===========================================================================
-- 0195 — THE MODULE KEYS THAT SHIPPED WITHOUT BEING GRANTED.
--
-- The user, 2026-09-14: "Update the Roles & Permissions - Always when a New UI
-- is introduced or when a UI is re-arranged -- This is often missed."
--
-- It was missed, three times, and this file is the repair. Found by asking the
-- code rather than by reading the backlog:
--
--   mod:/machine-history     0 migrations.  12 roles hold it in DEFAULT_PERMS.
--   mod:/exports/calls       0 migrations.  12 roles hold it in DEFAULT_PERMS.
--   mod:/exports/feedback    0 migrations.  12 roles hold it in DEFAULT_PERMS.
--
-- WHY A CODE DEFAULT IS NOT ENOUGH, and this is the whole point of the file.
-- `permsForRole()` is
--
--     if (stored && stored.length) return stored;      // the app_roles row
--     return DEFAULT_PERMS[role] ?? DEFAULT_PERMS.engineer;
--
-- so the defaults apply ONLY to a role whose stored set is EMPTY. On a project
-- that has been in use every role has a tuned row, so a new module's key
-- reaches nobody until a migration puts it there. The screen ships, the menu
-- entry exists in the code, the permission is ticked in DEFAULT_PERMS — and the
-- page is invisible to all twelve roles. That is the "a role that sees NOTHING"
-- fault in CLAUDE.md arriving through the front door.
--
-- MACHINE HISTORY IS THE SEVERE ONE: it has no parent key, so nothing covered
-- for it. The two reports were partly saved by `parentAction()`, which makes
-- `mod:/exports` stand in for every `mod:/exports/*` — but only for a role
-- holding the parent. 0155 gave `zoho_migration` the report sub-pages ONE BY
-- ONE ('mod:/exports/consumption','mod:/exports/kpi','mod:/exports/unused'),
-- and a list written out in full is a list that goes stale: the two reports
-- added on 2026-09-14 are not in it, so that role's matrix shows them unticked.
--
-- GRANTED TO EXACTLY THE ROLES THAT HOLD THEM IN CODE — all twelve — so this
-- widens nothing: it makes the database say what the application already says.
--
-- MERGED, NEVER OVERWRITTEN (CLAUDE.md): an administrator may have tuned the
-- role, and overwriting would throw that away.
--
-- A ROLE WITH NO PERMISSIONS AT ALL IS LEFT ALONE, and deliberately: an empty
-- array means "not configured" and the code falls back to the defaults, which
-- already contain these keys. Writing one key into it would turn that fallback
-- OFF and leave the role holding three permissions and nothing else. 0176 made
-- the same decision for `ffr.view`, for the same reason.
-- ===========================================================================

do $$
declare n int;
begin
  if to_regclass('public.app_roles') is null then return; end if;

  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(array[
                 'mod:/machine-history',
                 'mod:/exports/calls',
                 'mod:/exports/feedback'
               ]) as v
             ) u
         ),
         updated_at = now()
   -- ONLY a role that is actually configured, and only one still missing at
   -- least one of the three — so a re-run changes nothing.
   where jsonb_array_length(ar.permissions) > 0
     and not (ar.permissions ?& array['mod:/machine-history',
                                      'mod:/exports/calls',
                                      'mod:/exports/feedback']);
  get diagnostics n = row_count;
  raise notice '0195: % role(s) given the module keys that shipped without them', n;
end $$;
