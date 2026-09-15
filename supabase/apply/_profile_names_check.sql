-- ===========================================================================
-- WHY SOMEBODY'S PROFILE SHOWS THE WRONG ROLE, OR A "?" WHERE THEIR INITIAL
-- SHOULD BE. READ-ONLY. Paste the whole file into the Supabase SQL editor.
--
-- Reported 2026-09-15 with a screenshot: "For a few engineers, it shows a
-- question mark in the profile. This is user Dipika / Depika - Zoho Migration",
-- then: "Why is it showing as engineer and not Zoho Migration."
--
-- TWO VALUES ANSWER TO THE NAME "ROLE" AND THEY ARE NOT KEPT IN STEP.
--   • `user_directory.role`  — what User Master shows. Editable there.
--   • `profiles.role`        — what the person's SIGN-IN actually runs on:
--     the menu-bar chip, `has_perm()`, every policy.
-- `ensure_my_profile()` copies the first into the second ONLY WHEN IT CREATES
-- THE ROW — `if found then return p; end if;` — and the only other thing that
-- copies it is SAVING that person's row in User Master while their email
-- matches. So a role changed in User Master AFTER somebody first signed in
-- stays in User Master: the directory reads "Zoho Migration", the chip reads
-- "Engineer", and their access is the engineer's. The chip is not lying about
-- their access; it is reporting it correctly, and User Master is the screen
-- that is out of date.
--
-- THE FIRST VERSION OF THIS FILE COULD NOT SEE THAT. It ended in
-- `where p.id is null or full_name = ''` — so a profile that exists, has a
-- name, and differs only in its ROLE was filtered out, and the run came back
-- "Success. No rows returned" on a project where the drift was real. A
-- diagnostic that filters can hide the case it was written for, so this one
-- does not filter: it returns EVERY sign-in, worst first. "No rows" from the
-- query below means there are no auth users at all.
--
-- SINCE 0199 THE DRIFT IS NO LONGER CREATED: `user_directory_profile_sync`
-- applies a User Master role to the sign-in as it is written. This file stays
-- as the PROOF of that, and because two things it reports are still possible —
-- a login claimed by TWO directory rows, and a name that was corrected on one
-- side only before the trigger existed.
--
-- SECTION B (commented out) is the repair. Read A first.
-- ===========================================================================

-- ---- A. EVERY SIGN-IN, WORST FIRST ----------------------------------------
-- One row per `auth.users` row — the people who can actually sign in — joined
-- to the profile their session reads and to their User Master row. It starts
-- from auth.users, not from profiles, because somebody with NO PROFILE ROW is
-- one of the causes and would not appear in a scan of profiles at all.
--
-- The verdicts, in the order they sort:
--   1  NO PROFILE ROW          — boots on the bare-engineer identity.
--   2  no name on the profile  — this is the "?" avatar. The same value is
--                                what the audit trail records as the ACTOR, so
--                                it is not cosmetic.
--   3  ROLE DRIFT              — the sign-in role is not the User Master role.
--                                0199 stops this being created; a row here now
--                                means something wrote `profiles` directly.
--   4  TWO USER MASTER ROWS    — one login, two directory rows. "The" name for
--                                that sign-in has no answer, so the sync leaves
--                                it alone and whichever row is saved last
--                                decides the role.
--   5  name drift              — both sides have a name and they differ. Only
--                                SHOWN, never enforced, which is why it sorts
--                                below the role — but it is what the audit trail
--                                records as the actor.
--   6  not in User Master      — signs in, but no directory row to check
--                                against; nothing syncs their role, ever.
--   7  looks fine.
select case when p.id is null then '1 NO PROFILE ROW — boots as a bare engineer'
            when coalesce(btrim(p.full_name), '') = '' then '2 no name on the profile — this is the "?" avatar'
            when coalesce(btrim(d.role), '') <> '' and lower(btrim(coalesce(p.role, ''))) is distinct from lower(btrim(d.role))
              then '3 ROLE DRIFT — something wrote the sign-in directly'
            when (select count(*) from public.user_directory d2
                   where lower(btrim(coalesce(d2.email, ''))) = lower(btrim(coalesce(u.email, '')))
                      or lower(btrim(coalesce(d2.gmail, ''))) = lower(btrim(coalesce(u.email, '')))) > 1
              then '4 TWO USER MASTER ROWS for one login — the name cannot follow'
            when d.id is not null and coalesce(btrim(d.name), '') <> ''
             and btrim(coalesce(p.full_name, '')) is distinct from btrim(d.name)
              then '5 name drift — shown, not enforced; corrects itself when the row is saved'
            when d.id is null then '6 not in User Master — nothing will ever sync their role'
            else '7 looks fine'
       end                                                        as "verdict",
       coalesce(nullif(btrim(u.email), ''), '(auth user has no email)') as "signs in as",
       coalesce(nullif(btrim(p.full_name), ''), '(blank)')         as "name on the sign-in profile",
       coalesce(nullif(btrim(d.name), ''), '(not in User Master)')  as "name in User Master",
       coalesce(nullif(btrim(p.role), ''), '(none)')               as "role the sign-in runs on",
       coalesce(nullif(btrim(pr.label), ''), '(no such role)')     as "…shown in the menu bar as",
       coalesce(nullif(btrim(d.role), ''), '(none)')               as "role in User Master",
       coalesce(nullif(btrim(dr.label), ''), '(no such role)')     as "…which means",
       u.id                                                        as "auth user id"
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_directory d
    on lower(btrim(coalesce(d.email, ''))) = lower(btrim(coalesce(u.email, '')))
    or lower(btrim(coalesce(d.gmail, ''))) = lower(btrim(coalesce(u.email, '')))
  left join public.app_roles pr on pr.role = lower(btrim(coalesce(p.role, '')))
  left join public.app_roles dr on dr.role = lower(btrim(coalesce(d.role, '')))
 order by 1, 2;

-- (ONE STATEMENT ON PURPOSE. The Supabase SQL editor shows a single result
-- grid, so a file with two SELECTs hands back only the last one.)


-- ---- B. THE REPAIR. Commented out on purpose; read A first. ---------------
-- B1 COPIES THE USER MASTER ROLE ONTO THE SIGN-IN, for everybody reading
-- "3 ROLE DRIFT" above. 0199 carries the same statement as its backfill, so on
-- a project that has run `rbac.sql` there should be nobody left for it; it is
-- kept for a project that has not, and as the repair if something ever writes
-- `profiles` directly again. IT IS AN ACCESS CHANGE, not a label fix.
-- It refuses a directory role that is not a real role (`join app_roles`), so a
-- typo cannot strand somebody on a key nothing grants.
--
-- CHECK SECTION A FIRST AND MEAN IT: whatever User Master says is what these
-- people will be able to do afterwards. If a directory row is wrong, fix it in
-- User Master and re-run A before running this.
--
-- They see the new role the next time their session loads the profile —
-- signing out and back in is the reliable way.
--
-- begin;
--
-- update public.profiles p
--    set role = lower(btrim(d.role))
--   from public.user_directory d
--   join public.app_roles r on r.role = lower(btrim(d.role))
--  where (lower(btrim(coalesce(d.email, ''))) = lower(btrim(coalesce(p.email, '')))
--      or lower(btrim(coalesce(d.gmail, ''))) = lower(btrim(coalesce(p.email, ''))))
--    and coalesce(btrim(d.role), '') <> ''
--    and lower(btrim(coalesce(p.role, ''))) is distinct from lower(btrim(d.role));
--
-- B2 fills a BLANK NAME from the User Master — the "?" avatar. It does NOT
-- invent anything: a profile with no directory row is left for somebody to
-- type a name into, because a made-up name on a quality record is worse than a
-- blank one; at least a blank is visibly missing.
--
-- update public.profiles p
--    set full_name = d.name
--   from public.user_directory d
--  where coalesce(btrim(p.full_name), '') = ''
--    and coalesce(btrim(d.name), '') <> ''
--    and (lower(btrim(coalesce(d.email, ''))) = lower(btrim(coalesce(p.email, '')))
--      or lower(btrim(coalesce(d.gmail, ''))) = lower(btrim(coalesce(p.email, ''))));
--
-- What is left over afterwards — run this before deciding to commit:
--
-- select count(*) filter (where coalesce(btrim(full_name), '') = '') as "still nameless",
--        count(*)                                                    as "profiles"
--   from public.profiles;
--
-- rollback;   -- <<< change to `commit;` to keep it
