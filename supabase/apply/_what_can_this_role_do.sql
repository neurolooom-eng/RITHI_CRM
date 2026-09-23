-- ===========================================================================
-- WHAT DOES A ROLE ACTUALLY HOLD? Read-only. Nothing is changed.
--
-- Asked because the SCREEN and the DATABASE can disagree, and until 0.9.354 the
-- screen was the one that was wrong: Roles & Permissions built its matrix in a
-- `useState` initialiser, which runs once at mount -- so if it opened before
-- `app_roles` had loaded it drew the CODE DEFAULTS and never corrected itself.
-- An administrator reading it was reading the code's idea of each role and
-- believing it was this project's.
--
-- So when somebody says "I ticked it and it does not work", there are four
-- different answers and they need opposite fixes:
--
--   * the row does not hold the action      -> the tick was never saved
--   * the row holds it                      -> the USER's session is stale;
--                                              reload, or they are on a
--                                              different role than you think
--   * the row is EMPTY                      -> "not configured": has_perm()
--                                              falls back to the ENGINEER
--                                              defaults, which is not "no
--                                              permissions" and surprises
--                                              everybody
--   * the person is not on that role at all -> look at section 3
--
-- RUN IT UNCHANGED FIRST. Section 0 is EVERY role with what it holds, which is
-- the map you want before asking about one -- and an unchanged run is therefore
-- useful rather than a dead end. It was not, and somebody ran it without
-- editing line 34 on the day it shipped: correct, honest, and no help at all.
--
-- THEN change the role on that line for the detail. `CHANGE-ME` matches
-- nothing, so an unchanged run never answers confidently about somebody else.
-- ===========================================================================

with ask as (select 'CHANGE-ME'::text as role_key),          -- e.g. 'technical_support'
r as (
  select ar.role, ar.label, ar.permissions,
         jsonb_array_length(ar.permissions) as n
    from public.app_roles ar, ask a
   where ar.role = a.role_key
)
select * from (
  -- 0. EVERY ROLE, ALWAYS. What each one holds, in one line: the ACTIONS decide
  --    what somebody can DO, the module keys only decide which pages open, and
  --    the two are counted apart because conflating them is how "it has 69
  --    permissions" gets read as "it can do 69 things".
  select 0 as sort, 'every role — actions / pages' as section,
         ar.role || '  ·  ' || lpad(
           (select count(*) from jsonb_array_elements_text(ar.permissions) v where v not like 'mod:/%')::text, 3)
         || ' actions  ·  ' || lpad(
           (select count(*) from jsonb_array_elements_text(ar.permissions) v where v like 'mod:/%')::text, 3)
         || ' pages' as finding,
         case when jsonb_array_length(ar.permissions) = 0
              then 'EMPTY — "not configured", so has_perm() falls back to the ENGINEER defaults'
              when not exists (select 1 from jsonb_array_elements_text(ar.permissions) v where v not like 'mod:/%')
              then 'READ-ONLY — holds pages but no action at all'
              else '' end as detail
    from public.app_roles ar

  union all
  -- 1. Did the name on line 34 match anything? READ THIS ROW NEXT.
  select 1 as sort, 'the role' as section,
         case when exists (select 1 from r)
              then 'found: ' || (select role || ' — ' || coalesce(label, '') from r)
              else 'NOT FOUND — the role key on the `ask` line above matches no row in app_roles. Section 0 lists them all. '
                   || 'The keys are: ' || (select string_agg(role, ', ' order by role) from public.app_roles)
         end as finding, '' as detail

  union all
  -- 1. How many permissions, and the warning that matters.
  --    ONLY WHERE THE ROLE EXISTS. "0 permission(s) stored" printed beside
  --    "NOT FOUND" reads as a role that exists and holds nothing, which is a
  --    different (and alarming) finding -- the row is absent instead.
  select 2, 'the role', r.n::text || ' permission(s) stored',
         case when r.n = 0
              then 'EMPTY MEANS "NOT CONFIGURED", NOT "NONE": has_perm() falls back to the ENGINEER defaults for this role.'
              else '' end
    from r

  union all
  -- 2. The ACTIONS it holds -- everything that is not a module key. This is the
  --    half that decides what somebody can DO; the module keys only decide
  --    which pages open.
  select 3, 'actions it holds', v, ''
    from r, lateral jsonb_array_elements_text(r.permissions) v
   where v not like 'mod:/%'

  union all
  -- 3. Who is on it. A permission question is often a ROLE question: the
  --    person is on a different role than the one being inspected, and every
  --    tick in the world on this one changes nothing for them.
  --    profiles.role is what the application ENFORCES; user_directory.role is
  --    what User Master shows, and 0199 syncs the first from the second.
  select 4, 'people the application has on this role',
         coalesce(nullif(btrim(p.full_name), ''), p.email, p.id::text),
         case when ud.role is not null and lower(btrim(ud.role)) <> lower(btrim(p.role))
              then 'User Master says "' || ud.role || '" — the two disagree' else '' end
    from public.profiles p
    left join public.user_directory ud on lower(btrim(ud.email)) = lower(btrim(p.email))
   where lower(btrim(p.role)) = (select lower(btrim(role_key)) from ask)

  union all
  -- 4. The pages it can open, counted rather than listed: 60-odd rows of
  --    `mod:/x` would bury sections 2 and 3, which are the ones being asked
  --    about.
  select 5, 'pages it can open', count(*)::text || ' module key(s)', ''
    from r, lateral jsonb_array_elements_text(r.permissions) v
   where v like 'mod:/%'
  having count(*) > 0
) report order by sort, finding;
