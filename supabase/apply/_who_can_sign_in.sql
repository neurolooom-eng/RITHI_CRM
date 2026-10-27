-- ===========================================================================
-- WHO CAN SIGN IN, AND WITH WHAT -- COUNTS ONLY.   Read-only.
--
-- Security scan, 2026-10-27 (docs/SECURITY_SCAN.md, F-02). Self sign-up is
-- open on the live project with no email confirmation, and until 0463
-- ensure_my_profile() gave ANY login an active Engineer profile, User Master
-- or not. This counts what that may already have let in.
--
-- COUNTS AND EMAIL DOMAINS ONLY, NO NAME OR ADDRESS: it is run through the
-- migration workflow, whose log is public with this repository. Nothing to
-- edit; run the whole file. One grid.
-- ===========================================================================
with um as (
  select lower(btrim(email)) as e from public.user_directory where btrim(coalesce(email, '')) <> ''
  union select lower(btrim(gmail)) from public.user_directory where btrim(coalesce(gmail, '')) <> ''
),
p as (
  select pr.*, lower(btrim(pr.email)) as e, (lower(btrim(pr.email)) in (select e from um)) as on_um
    from public.profiles pr
)
select 1 as sort_order, 'sign-in accounts (auth.users)' as what, count(*)::text as n from auth.users
union all
select 2, 'accounts with NO profile (unresolved: hold nothing since 0300)', count(*)::text
  from auth.users u where not exists (select 1 from public.profiles x where x.id = u.id)
union all
select 3, 'profiles', count(*)::text from p
union all
select 4, 'profiles whose email is on NO User Master row', count(*)::text from p where not on_um
union all
select 5, '...of those, active', count(*)::text from p where not on_um and coalesce(active, true)
union all
select 10 + row_number() over (order by role)::int, '...by role: ' || role, count(*)::text
  from p where not on_um group by role
union all
select 30 + row_number() over (order by d)::int, '...by email domain: ' || d, n::text
  from (select split_part(e, '@', 2) as d, count(*) as n from p where not on_um group by 1) x
union all
select 50 + row_number() over (order by m)::int, '...created in ' || m, n::text
  from (select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as m, count(*) as n
          from p where not on_um group by 1) x
union all
select 80, 'User Master rows with an address and NO login yet (an address anybody could sign up with)', count(*)::text
  from public.user_directory d
 where btrim(coalesce(d.email, '') || coalesce(d.gmail, '')) <> ''
   and not exists (select 1 from public.profiles x where lower(btrim(x.email)) in (lower(btrim(d.email)), lower(btrim(d.gmail))))
order by 1;
