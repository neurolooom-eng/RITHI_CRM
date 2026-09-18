-- ===========================================================================
-- WHY DOES THIS PERSON SEE SO MUCH?
--
-- READ-ONLY. Change the ONE marked email, paste into the Supabase SQL editor,
-- run. One grid.
--
-- There are exactly THREE ways anybody sees a call or a spare request that is
-- not their own, and they are very different problems:
--
--   1. THE ROLE IS AN OFFICE ROLE. hotline, nsm, commercial, spare_coordinator,
--      stores_incharge and tally_coordinator see everything by design. That
--      list is written into `can_view_all_calls()` and a Regional Manager is
--      NOT on it.
--   2. THE ROLE HOLDS `data.view_all`. That single permission turns
--      can_view_all_calls() true for anybody. No migration grants it to a
--      Regional Manager, so if it is there it was ticked on the Roles &
--      Permissions screen -- and one tick is the whole difference between a
--      region and the company.
--   3. THE DIRECTORY SAYS THEY MANAGE THAT MANY PEOPLE. `visible_engineer_names()`
--      walks user_directory downwards from the caller, by reporting_manager AND
--      regional_manager. A regional manager legitimately covers a region, so a
--      long list here is not by itself wrong.
--
-- Rows 4 and 5 are the ones to read together: if row 4 says false and row 5
-- returns a sane number, nothing is broken. If row 4 says TRUE, that is your
-- answer and it is a permission, not a bug.
-- ===========================================================================
with u as (
  select p.id, p.email, p.full_name, lower(btrim(coalesce(p.role, ''))) as role
    from public.profiles p
    -- >>> CHANGE THIS ONE LINE
   where lower(p.email) = lower('CHANGE-ME@example.com')
)
select * from (values (0, '— WHO —', '', '')) v(n, "check", answer, meaning)
union all
select 1, 'the person', coalesce((select full_name||' · '||email from u), '*** NOT FOUND ***'),
       'If this is not found, nothing below means anything.'
union all
select 2, 'their role', coalesce((select role from u), '(none)'),
       'Only hotline, nsm, commercial, spare_coordinator, stores_incharge and tally_coordinator see everything by design.'
union all
select 3, 'is that one of the see-everything roles',
       (select case when (select role from u) in
          ('hotline','nsm','commercial','spare_coordinator','stores_incharge','tally_coordinator')
        then 'YES — by design' else 'no' end),
       'A Regional Manager is not on that list.'
union all
select 4, 'does their role hold data.view_all',
       coalesce((select case when a.permissions ? 'data.view_all' then '*** YES — this is why ***' else 'no' end
                   from public.app_roles a where a.role = (select role from u)), '(no app_roles row)'),
       'This single permission turns can_view_all_calls() true for ANY role. No migration grants it to a Regional Manager, so a YES here was ticked by hand on Roles & Permissions. Untick it there to undo.'
union all
select 5, 'are they an admin',
       coalesce((select case when a.permissions ? 'admin' or (select role from u) = 'admin'
                             then 'YES — admins see everything' else 'no' end
                   from public.app_roles a where a.role = (select role from u)), 'no'),
       'Admins bypass every visibility rule.'
union all
select 6, '— WHAT THE DIRECTORY SAYS —', '', ''
union all
select 7, 'their row in user_directory',
       coalesce((select 'name="'||coalesce(d.name,'')||'" · reports to "'||coalesce(d.reporting_manager,'')
                        ||'" · regional "'||coalesce(d.regional_manager,'')||'"'
                   from public.user_directory d, u
                  where lower(d.email) = lower(u.email) or lower(d.gmail) = lower(u.email) limit 1),
                '*** NO DIRECTORY ROW ***'),
       'A BLANK name here was the bug 0212 fixed: the team walk matched manager="" against name="" and pulled in every row with no manager recorded. Check row 164 of _status.sql to see whether that fix is applied on this project.'
union all
select 8, 'people directly under them',
       (select count(*)::text from public.user_directory d, u
         where btrim(coalesce((select name from public.user_directory x
                                where lower(x.email)=lower(u.email) limit 1),'')) <> ''
           and (lower(d.reporting_manager) = lower((select name from public.user_directory x where lower(x.email)=lower(u.email) limit 1))
             or lower(d.regional_manager)  = lower((select name from public.user_directory x where lower(x.email)=lower(u.email) limit 1)))),
       'Directly named under them. A regional manager legitimately has many.'
union all
select 9, 'rows in the directory with NO manager at all',
       (select count(*)::text from public.user_directory
         where btrim(coalesce(reporting_manager,'')) = '' and btrim(coalesce(regional_manager,'')) = ''),
       'The blast radius of the blank-name bug: before 0212 these are exactly the rows a name-less manager absorbed. A large number here with an unfixed project explains a very long engineer list.'
union all
select 10, 'people in the directory, in total',
       (select count(*)::text from public.user_directory),
       'Compare with row 8. If the engineer list on screen is closer to this than to row 8, they are seeing more than their region.'
order by 1;
