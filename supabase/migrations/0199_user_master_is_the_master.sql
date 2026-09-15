-- ===========================================================================
-- USER MASTER IS THE MASTER: a role set there reaches the sign-in by itself.
--
-- The user's rule, 2026-09-15: *"The intent and the fact has to match 100% —
-- the user master is the only place I can map and configure."*
--
-- TWO VALUES ANSWER TO THE NAME "ROLE" AND NOTHING KEPT THEM IN STEP.
--   • `user_directory.role`  — what User Master shows. Set by an administrator.
--   • `profiles.role`        — what the sign-in RUNS ON: the menu-bar chip,
--                              `has_perm()`, every policy.
-- 0033 copies the first into the second exactly once — inside
-- `ensure_my_profile()`, which returns early for a row that already exists
-- (`if found then return p; end if;`). After that, the only thing that copied
-- it was SAVING that person's row on the User Master screen, in the browser,
-- by email match (`UserMasterView.persist`). So a role changed after somebody
-- first signed in stayed in User Master: the screen said one thing and their
-- access was another, with nothing anywhere reporting the difference.
--
-- Reported twice. 2026-09-11: *"Why is it now Engineer"* — which produced the
-- drift banner and its "Apply roles" button, a REPAIR for a problem still
-- being created. 2026-09-15: *"Why is it showing as engineer and not Zoho
-- Migration."*
--
-- A BUTTON THAT REPAIRS DRIFT IS NOT THE SAME AS NOT DRIFTING. Somebody has to
-- open the right screen, notice the banner and press it; in between, the
-- application enforces a role nobody chose. This makes the copy automatic, in
-- the database, so it happens for every path that writes a directory row — the
-- screen, a bulk import, an admin's own SQL — and not only the one the browser
-- knows about.
--
-- WHAT IT DOES NOT DO, deliberately:
--   • It never invents a role. A blank directory role leaves the sign-in alone,
--     and a role the matrix does not know (a typo, a role since deleted) is
--     ignored rather than applied — a typo must grant nothing, not something
--     unintended. Same rule `ensure_my_profile()` already uses.
--   • It does not weaken one guard. `profiles_role_guard` (0008) still fires:
--     nobody moves their own role, and granting `admin` still needs an
--     administrator. If an administrator edits their OWN User Master row and
--     changes the role on it, the save is REFUSED with that guard's message —
--     correct, and the only way the two screens can stay honest.
--   • It does not touch a NAME while two directory rows share one login.
--     `service.almsind@gmail.com` has two (eBizWiz Admin, WRITE OFF), so "the"
--     name for that sign-in is not a question with an answer; whichever row was
--     saved last would win and "WRITE OFF" would become somebody's display
--     name. A name needs ONE unambiguous source. The role is still applied —
--     the duplicates agree about it, and a wrong role is enforced where a wrong
--     name is only shown.
-- ===========================================================================

create or replace function public.sync_profile_from_user_directory()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role   text := lower(btrim(coalesce(new.role, '')));
  v_name   text := btrim(coalesce(new.name, ''));
  v_desig  text := btrim(coalesce(new.designation, ''));
  v_emails text[];
  v_shared boolean;
begin
  -- The sign-in is found by email OR gmail, the same two the screen matches on
  -- and the same two `ensure_my_profile()` uses. A row with neither reaches no
  -- sign-in at all.
  v_emails := array_remove(array[lower(btrim(coalesce(new.email, ''))),
                                 lower(btrim(coalesce(new.gmail, '')))], '');
  if coalesce(array_length(v_emails, 1), 0) = 0 then return new; end if;

  -- A role the matrix does not know grants nothing rather than something
  -- unintended — so it is dropped here, not written and left to fail later.
  if v_role <> '' and not exists (select 1 from public.app_roles a where a.role = v_role) then
    v_role := '';
  end if;

  -- Is this login claimed by more than one directory row? Then its NAME has no
  -- single source and is left alone (see the header).
  select exists (
    select 1 from public.user_directory d
     where d.id is distinct from new.id
       and (lower(btrim(coalesce(d.email, ''))) = any(v_emails)
         or lower(btrim(coalesce(d.gmail, ''))) = any(v_emails))
  ) into v_shared;

  update public.profiles p
     set role        = case when v_role  <> ''                 then v_role  else p.role end,
         full_name   = case when v_name  <> '' and not v_shared then v_name  else p.full_name end,
         designation = case when v_desig <> '' and not v_shared then v_desig else p.designation end
   where lower(btrim(p.email)) = any(v_emails)
     and ((v_role  <> ''                 and p.role      is distinct from v_role)
       or (v_name  <> '' and not v_shared and p.full_name is distinct from v_name)
       or (v_desig <> '' and not v_shared and coalesce(p.designation, '') is distinct from v_desig));

  return new;
end $$;

comment on function public.sync_profile_from_user_directory() is
  'User Master is the master: a role (and, where the login has one directory row, the name and designation) set there is applied to that person''s sign-in immediately.';

revoke all on function public.sync_profile_from_user_directory() from public;

drop trigger if exists user_directory_profile_sync on public.user_directory;
create trigger user_directory_profile_sync
  after insert or update on public.user_directory
  for each row execute function public.sync_profile_from_user_directory();

-- ---------------------------------------------------------------------------
-- THE BACKFILL, for what drifted before the trigger existed.
--
-- ROLE: applied wherever it differs and the matrix knows it. On the live
-- project as of 2026-09-15 this changes NOTHING — all 58 sign-ins already
-- match, because the drift found this week was applied by hand. That is the
-- point of running it anyway: a database rebuilt from these migrations, or one
-- that fell behind, lands in the same state as the live one.
--
-- NAME: only where the profile's name is BLANK — the "?" avatar, which is also
-- what the audit trail records as the actor. A name that is present and merely
-- DIFFERENT is left alone: three logins have one today and one of them is
-- ambiguous, so correcting them is a decision about people, not a migration.
-- They correct themselves the next time those User Master rows are saved.
-- ---------------------------------------------------------------------------
do $$
declare n_role int; n_name int;
begin
  with src as (
    select p.id, lower(btrim(d.role)) as role
      from public.profiles p
      join public.user_directory d
        on lower(btrim(p.email)) = lower(btrim(coalesce(d.email, '')))
        or lower(btrim(p.email)) = lower(btrim(coalesce(d.gmail, '')))
      join public.app_roles a on a.role = lower(btrim(d.role))
     where coalesce(btrim(d.role), '') <> ''
       and p.role is distinct from lower(btrim(d.role))
  )
  update public.profiles p set role = src.role from src where src.id = p.id;
  get diagnostics n_role = row_count;

  with src as (
    select p.id, btrim(d.name) as name
      from public.profiles p
      join public.user_directory d
        on lower(btrim(p.email)) = lower(btrim(coalesce(d.email, '')))
        or lower(btrim(p.email)) = lower(btrim(coalesce(d.gmail, '')))
     where coalesce(btrim(p.full_name), '') = ''
       and coalesce(btrim(d.name), '') <> ''
  )
  update public.profiles p set full_name = src.name from src where src.id = p.id;
  get diagnostics n_name = row_count;

  raise notice 'User Master sync backfill: % role(s) applied, % blank name(s) filled', n_role, n_name;
end $$;
