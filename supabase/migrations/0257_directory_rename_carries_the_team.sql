-- ===========================================================================
-- CORRECTING A MANAGER'S NAME NO LONGER EMPTIES THEIR TEAM (finding 23).
--
-- The reporting tree is built from NAMES: `user_directory.reporting_manager`
-- and `.regional_manager` hold a manager's name, and `visible_engineer_names()`
-- matches them against `name`, case-insensitively. Nothing carried a change of
-- that name, so correcting a spelling on User Master left every engineer
-- pointing at a name nobody holds any more. Measured: the Reporting Manager
-- saw 3 people before one edit and 1 after — themselves — and lost every
-- call, spare request, visit and review their team's names scope, with no
-- error anywhere.
--
-- THE USER'S DECISION (2026-09-30): "Carry the rename". When a directory
-- row's name changes, every row naming the OLD name as its Reporting or
-- Regional Manager is updated to the NEW name in the same statement.
--
-- THREE LIMITS, each on purpose:
--
--   1. A BLANK OLD NAME CARRIES NOTHING. Naming somebody who had no name would
--      otherwise rewrite every row with no manager recorded — the blank-name
--      trap 0212 closed on the read side.
--   2. IF ANOTHER ROW STILL CARRIES THE OLD NAME, NOTHING IS CARRIED. Two
--      directory rows with one name are two people the tree already cannot
--      tell apart; the rows naming it still resolve to the one who kept it,
--      and moving them to the renamed person would be a guess.
--   3. A CHANGE OF CASE ONLY CARRIES NOTHING. The tree compares with lower(),
--      so "ravi kumar" -> "Ravi Kumar" breaks nothing and rewriting the team
--      would be writes for no reason.
--
-- IT MATCHES EXACTLY AS THE TREE DOES — lower(), no trimming. A btrim() here
-- would also rewrite a row naming ' Ravi ', which the tree does NOT count as
-- Ravi's today, and so WIDEN a team; this migration only keeps one.
--
-- THE RECORDS filed under the old name — calls, requests, spares,
-- consumption, hand stock — are 0259's, a second trigger: the user first chose
-- to leave them, then (same day, once told that call visibility is by name
-- too) "Rename existing records".
--
-- SECURITY INVOKER. Only an ADMINISTRATOR can change a name at all —
-- `user_directory_address_guard` refuses anybody else any column but the
-- address — and an administrator may write every row, so the cascade can never
-- be partly refused. Running as the caller also stamps sys_updated_by with the
-- person who renamed.
-- ===========================================================================

create or replace function public.user_directory_carry_rename()
returns trigger language plpgsql set search_path = public as $$
begin
  if btrim(coalesce(old.name, '')) = ''
     or lower(old.name) = lower(coalesce(new.name, '')) then
    return null;
  end if;
  if exists (select 1 from public.user_directory d
              where d.id <> new.id and lower(d.name) = lower(old.name)) then
    return null;
  end if;

  update public.user_directory d
     set reporting_manager = new.name
   where d.id <> new.id
     and lower(d.reporting_manager) = lower(old.name);

  update public.user_directory d
     set regional_manager = new.name
   where d.id <> new.id
     and lower(d.regional_manager) = lower(old.name);

  return null;
end $$;

comment on function public.user_directory_carry_rename() is
  'When a User Master name changes, rows naming the old name as Reporting or Regional Manager follow it (finding 23). Not when the old name was blank, is still held by another row, or only its case changed.';

drop trigger if exists user_directory_carry_rename on public.user_directory;
create trigger user_directory_carry_rename
  after update of name on public.user_directory
  for each row execute function public.user_directory_carry_rename();
