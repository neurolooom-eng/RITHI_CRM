-- ===========================================================================
-- WHY IS THIS LIST EMPTY?
--
-- READ-ONLY. Paste into the Supabase SQL editor, change the ONE email on the
-- line marked below, and run. It returns a single grid.
--
-- WHY THIS EXISTS. "The screen is empty" is the most common fault this project
-- reports and it has had at least ten different causes: data never imported, a
-- migration not applied, a role's permission set missing one key, a read policy
-- the reader does not pass, a module key not in app_roles, PostgREST's
-- 1,000-row cap, an order column the view renames (which ERRORS, so the
-- register comes back empty), a bundle replayed out of order, an error caught
-- and turned into an empty array, and simply having no rows of your own.
--
-- Every one of those looks identical on screen. This asks the database the
-- questions that tell them apart, in the order that narrows fastest:
--   1-2  is this person known, and what does their role actually hold?
--   4-7  is there data at all, and is any of it theirs to see?
--   9-11 are the rules themselves present and shaped as expected?
--
-- READ IT TOP DOWN AND STOP AT THE FIRST SURPRISE. The `meaning` column says
-- what each answer rules in or out, so the grid is the diagnosis rather than
-- the input to one.
-- ===========================================================================
with u as (
  select p.id, p.email, p.full_name, lower(btrim(coalesce(p.role, ''))) as role
    from public.profiles p
    -- >>> CHANGE THIS ONE LINE to the email of the person seeing the empty screen
   where lower(p.email) = lower('rajendraawasthi961@gmail.com')
),
r as (
  select a.role, coalesce(jsonb_array_length(a.permissions), 0) as perms
    from public.app_roles a
   where a.role = (select role from u)
)
select * from (values (0, '— WHO IS ASKING —', '', '')) v(n, "check", answer, meaning)
union all
select 1, 'the user is on the directory',
       coalesce((select full_name || ' · ' || email || ' · role=' || role from u), '*** NOT FOUND ***'),
       'No row here means the sign-in maps to no profile, and every role answer below is meaningless.'
union all
select 2, 'their role has a stored permission set',
       coalesce((select role || ' · ' || perms::text || ' permissions' from r), '*** NO app_roles ROW ***'),
       'ZERO permissions means the engineer defaults apply to them. A NON-ZERO set that is missing one key blocks exactly that key, silently and with no error.'
union all
select 3, '— IS THERE DATA AT ALL —', '', ''
union all
select 4, 'products (the install base)',
       (select count(*)::text from public.products) || ' machines',
       'This feeds the Product picker, and its read policy is ANY signed-in user. So a large number here means the data and the permission are both fine, and the fault is between the database and the browser — a stale cache, or a session that is no longer signed in.'
union all
select 5, 'distinct product names the picker should offer',
       (select count(*)::text from public.product_register_names),
       'What "pick a product" should list. Non-zero here with an empty dropdown on screen narrows it to the browser.'
union all
select 6, 'call_requests, in total',
       (select count(*)::text from public.call_requests),
       'What the Request Registration register reads. Zero means nobody has raised one yet, and the empty register is simply true.'
union all
select 7, 'call_requests this person may see',
       coalesce((select count(*)::text from public.call_requests c, u
                  where c.created_by = u.id
                     or lower(coalesce(c.email, '')) = lower(u.email)
                     or lower(btrim(coalesce(c.engineer, ''))) = lower(btrim(u.full_name))), '0'),
       'An engineer sees their own and their team''s. If row 6 is large and this is 0, the empty register is the VISIBILITY RULE WORKING AS DESIGNED, not a fault — and no amount of re-running SQL will change it.'
union all
select 8, '— ARE THE RULES THEMSELVES THERE —', '', ''
union all
select 9, 'products has a readable policy',
       coalesce((select string_agg(policyname, ', ') from pg_policies
                  where schemaname = 'public' and tablename = 'products' and cmd = 'SELECT'), '*** NONE ***'),
       'Row-level security is on. With no SELECT policy named here, nobody can read products at all and every product picker in the app is empty.'
union all
select 10, 'the office-role test exists',
       (select case when to_regprocedure('public.can_view_all_calls()') is null
                    then '*** MISSING ***' else 'present' end),
       'Missing means a migration has not been applied, and every visibility rule that calls it fails.'
union all
select 11, 'the permission test exists',
       (select case when to_regprocedure('public.has_perm(text)') is null
                    then '*** MISSING ***' else 'present' end),
       'Missing means the same, for every screen gated on a permission.'
order by 1;
