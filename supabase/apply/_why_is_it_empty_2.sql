-- ===========================================================================
-- WHAT DOES *THIS USER* ACTUALLY SEE? — part two.
--
-- READ-ONLY. Paste into the Supabase SQL editor, change the ONE email marked
-- below, and run. It prints one grid.
--
-- WHY A SECOND FILE. `_why_is_it_empty.sql` asks whether the data, the role and
-- the rules are there, and on the project it was first run against the answer
-- was YES to all of it: 19,253 machines, 44 product names, 4,357 call requests,
-- 2 of them this engineer's, every policy and function present. And the screens
-- were still empty.
--
-- THE GAP IS *WHO IS ASKING*. The SQL editor runs as the service role, which
-- bypasses row-level security and every table grant. The browser runs as
-- `authenticated`, which does not. So the first file can answer "the data is
-- there" while the browser is refused, and neither of them contradicts the
-- other.
--
-- This file closes that gap by BECOMING the user: it sets the same JWT claims
-- PostgREST would set and switches to the same role, then asks the same
-- questions. Whatever comes back is what the application gets.
--
-- IT IS SAFE. Everything runs inside one transaction that ROLLS BACK, so the
-- role change cannot outlive the query and nothing is written.
--
-- HOW TO READ IT. An ERROR is as useful as a number here:
--   * "permission denied for table X" -> the GRANT is missing on this project.
--     That is invisible to the first file, which checks policies, and it is
--     exactly what a bundle run in the wrong order can strip.
--   * a COUNT OF 0 where the first file showed thousands -> the row-level
--     policy is refusing this user, not the grant.
--   * the numbers matching the first file -> the database is serving this user
--     correctly and the fault is in the browser: a stale cached list, or a
--     request that failed and was turned into an empty list on the way back.
-- ===========================================================================
begin;

-- Become the person. `sub` and `email` are what the visibility rules read
-- through auth.uid() and auth.email().
select set_config('request.jwt.claims',
  (select json_build_object(
            'sub',   p.id,
            'email', p.email,
            'role',  'authenticated')::text
     from public.profiles p
     -- >>> CHANGE THIS ONE LINE
    where lower(p.email) = lower('rajendraawasthi961@gmail.com')
    limit 1), true);

set local role authenticated;

select * from (values (0, '— AS THIS USER, NOT AS THE ADMIN —', '')) v(n, "check", answer)
union all
select 1, 'the database agrees who I am',
       coalesce(nullif(current_setting('request.jwt.claims', true), ''), '*** NO CLAIMS — the email above matched no profile ***')
union all
select 2, 'products I can read',
       (select count(*)::text from public.products)
union all
select 3, 'product names the picker would receive',
       (select count(*)::text from public.product_register_names)
union all
select 4, 'call requests I can see',
       (select count(*)::text from public.call_requests)
union all
select 5, 'field calls I can see',
       (select count(*)::text from public.field_calls)
union all
select 6, 'am I treated as an office role',
       (select coalesce(public.can_view_all_calls()::text, 'NULL — the test could not be evaluated'))
union all
select 7, 'do I hold calls.view',
       (select coalesce(public.has_perm('calls.view')::text, 'NULL — the test could not be evaluated'))
union all
select 8, 'do I hold masters.view',
       (select coalesce(public.has_perm('masters.view')::text, 'NULL — the test could not be evaluated'))
order by 1;

rollback;
