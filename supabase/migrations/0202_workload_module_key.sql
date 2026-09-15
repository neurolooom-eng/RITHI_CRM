-- ===========================================================================
-- MY WORKLOAD REACHES THE ROLES THAT ALREADY OPEN THE REGISTERS.
--
-- The user, 2026-09-15: "Remove such cards in Main Views. Move those to a
-- Separate KPI Cards Page where ever applicable."
--
-- A NEW SCREEN IS NOT DONE UNTIL ROLES & PERMISSIONS KNOWS (the standing rule,
-- and it had been missed four times before 0195). `permsForRole()` is
--
--     if (stored && stored.length) return stored;      // the app_roles row
--     return DEFAULT_PERMS[role] ?? DEFAULT_PERMS.engineer;
--
-- so a code default reaches ONLY a role whose stored set is empty, and on a
-- project in use every role has a tuned row. Without this file the page ships,
-- the menu entry exists, the permission is ticked in DEFAULT_PERMS — and the
-- screen is invisible to every role, with no error anywhere. `check:ui` caught
-- exactly that on the first build of this screen, which is what it is for.
--
-- IT GRANTS NO REACH. The page holds NO authority of its own: it shows a
-- register's section only where the reader already holds that register's key,
-- and a section they cannot open is never even requested — so a queue they may
-- not read is never counted at them. "Spares waiting 240" would otherwise tell
-- somebody the size of a queue the register itself would refuse to show them.
-- So every role gets the key, and what each of them SEES on it is decided
-- entirely by what they already had.
--
-- MERGED, NEVER OVERWRITTEN: an administrator may have tuned the role.
--
-- A ROLE WITH NO PERMISSIONS AT ALL IS LEFT ALONE. An empty array means "not
-- configured" and the code falls back to the defaults, which already carry this
-- key; writing one key into it would turn that fallback OFF and leave the role
-- holding exactly one permission.
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
               select unnest(array['mod:/workload']) as v
             ) u
         ),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and not (ar.permissions ? 'mod:/workload');
  get diagnostics n = row_count;
  raise notice '0202: % role(s) given mod:/workload', n;
end $$;
