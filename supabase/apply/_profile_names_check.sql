-- ===========================================================================
-- WHY SOME PEOPLE SHOW A "?" WHERE THEIR INITIAL SHOULD BE.
--
-- Reported 2026-09-15 with a screenshot: "For a few engineers, it shows a
-- question mark in the profile. This is user Dipika / Depika - Zoho Migration."
--
-- THE AVATAR IS THE FIRST LETTER OF THE NAME, and the name falls back to the
-- email, so a "?" means BOTH ARE EMPTY on that person's `profiles` row.
--
-- IT IS NOT COSMETIC. The same value is what the audit trail records as the
-- ACTOR (`fullName || email` in auth.tsx), and what a printed document's
-- signature block names. A person with neither is somebody whose actions are
-- attributed to an empty string — which is the opposite of what an attributable
-- record is for, and the reason this file exists rather than a CSS fix.
--
-- WHERE IT DOES NOT COME FROM. `ensure_my_profile()` writes
-- `coalesce(nullif(btrim(dir.name),''), auth.email())`, so a profile it creates
-- always has something. A blank one was written by another path — a bulk load
-- of users, or a row created by hand — which is why the repair below reads the
-- USER MASTER rather than trying to reconstruct anything.
--
-- SECTION A COUNTS AND NAMES THEM. SECTION B (commented out) fills the name
-- from the User Master by email. Uncomment it only after reading A.
-- ===========================================================================

-- ---- A. WHO IS AFFECTED, AND WHAT CAN BE RECOVERED ------------------------
-- STARTS FROM `auth.users`, NOT FROM `profiles`, and that is the point. The
-- first version of this query scanned profiles — so somebody with NO PROFILE
-- ROW AT ALL, which is the most likely cause of the symptom, would not have
-- appeared in it at all. A diagnostic that cannot see the case it was written
-- for is worse than none.
--
-- THE SYMPTOM HAS TWO HALVES and they point at one cause: the avatar shows "?"
-- (no name) AND the role reads "Engineer" even for somebody on another role.
-- `sbCurrentProfile()` falls back to a MINIMAL IDENTITY when it cannot read a
-- profile row — `role: 'engineer'`, name from the email — and a person quietly
-- downgraded like that sees a working application with everything empty, which
-- looks like the app is broken rather than like access was not granted. The
-- all-zero dashboard in the report is consistent with exactly that.
select u.id,
       coalesce(nullif(btrim(u.email), ''), '(auth user has no email)') as "signs in as",
       case when p.id is null then 'NO PROFILE ROW — boots as a bare engineer'
            when coalesce(btrim(p.full_name), '') = '' and coalesce(btrim(p.email), '') = ''
              then 'profile has neither name nor email'
            when coalesce(btrim(p.full_name), '') = '' then 'profile has no name (shows the email)'
            else 'profile looks fine'
       end                                                     as "what is wrong",
       coalesce(nullif(btrim(p.role), ''), '(none)')            as "role on the profile",
       coalesce(nullif(btrim(d.name), ''), '(not in User Master)') as "name in User Master",
       coalesce(nullif(btrim(d.role), ''), '(none)')            as "role in User Master"
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_directory d
    on lower(btrim(coalesce(d.email, ''))) = lower(btrim(coalesce(u.email, '')))
    or lower(btrim(coalesce(d.gmail, ''))) = lower(btrim(coalesce(u.email, '')))
 where p.id is null
    or coalesce(btrim(p.full_name), '') = ''
 order by 3, 2;

-- (ONE STATEMENT ON PURPOSE. The Supabase SQL editor shows a single result
-- grid, so a file with two SELECTs hands back only the last one — and the
-- second version of this query was the weaker one, blind to a missing profile
-- row. The query above answers both questions, so there is only the one.)


-- ---- B. THE REPAIR. Commented out on purpose; read A first. ---------------
-- Fills the name from the User Master where one can be found. It does NOT
-- invent anything: a profile with no directory row is left for somebody to type
-- a name into, because a made-up name on a quality record is worse than a blank
-- one — at least a blank is visibly missing.
--
-- It rolls back as written. Change the last line to `commit;` when the count is
-- the one section A showed.
--
-- begin;
--
-- update public.profiles p
--    set full_name = d.name
--   from public.user_directory d
--  where coalesce(btrim(p.full_name), '') = ''
--    and coalesce(btrim(d.name), '') <> ''
--    and (lower(btrim(coalesce(d.email, ''))) = lower(btrim(coalesce(p.email, '')))
--      or lower(btrim(coalesce(d.gmail, ''))) = lower(btrim(coalesce(p.email, ''))));
--
-- select count(*) filter (where coalesce(btrim(full_name), '') = '') as "still nameless",
--        count(*)                                                    as "profiles"
--   from public.profiles;
--
-- rollback;   -- <<< change to `commit;` to keep it
