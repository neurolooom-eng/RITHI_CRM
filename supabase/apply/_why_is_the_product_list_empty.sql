-- ===========================================================================
-- WHY DOES THE PRODUCT PICKER ON A CALL REQUEST OFFER NOTHING?
--
-- Read-only. Paste the whole file into the Supabase SQL editor. Row 1 first.
--
-- Reported 2026-09-21, with a screenshot: CALL 1's Product box says
-- `Nothing matches ""` over an empty list, and the box under it sits on
-- "searching...". The user's reading was that RLS on Product Database is the
-- cause. MEASURED, IT IS NOT, and rows 1 and 2 show why: an engineer reads
-- EVERY row of `products` with RLS on, because the read policy is
-- `auth.role() = 'authenticated'` -- it filters nothing. RLS on that table
-- gates WRITES and nothing else.
--
-- What the list actually depends on is `product_register_names` (0098): the
-- DISTINCT of forty-odd product names, done in Postgres. `listMaster('product')`
-- asks for it and, ON ANY ERROR, FALLS THROUGH SILENTLY to paging the whole
-- register -- twenty-odd round trips for forty names, which on a phone is
-- exactly the "form is slow to open and can stop responding" the code's own
-- comment describes. If that view is missing or ungranted on this project, the
-- picker's emptiness is the FALLBACK failing, not the master being empty.
--
-- Rows 3 to 6 ask whether that view is there, granted, and returning names.
-- ===========================================================================
select * from (
  select 1 as n, 'Machines an ENGINEER can read (RLS applied)' as question,
         (select count(*)::text from public.products) as answer,
         'This is run as you, but the read policy is auth.role() = authenticated -- it admits every signed-in user to every row. If row 2 equals this, RLS is filtering nothing.' as what_it_means
  union all
  select 2, '   ...the read policy, verbatim',
         coalesce((select qual::text from pg_policies where tablename = 'products' and cmd = 'SELECT'), 'no SELECT policy'),
         'If this is auth.role() = authenticated, removing RLS cannot widen reads -- they are already open -- and cannot speed them up either.'
  union all
  select 3, '   ...and the write policy',
         coalesce((select qual::text from pg_policies where tablename = 'products' and cmd = 'ALL'), 'no write policy'),
         'THE ONLY THING RLS GATES HERE. Turn RLS off and every signed-in user may INSERT, UPDATE and DELETE the install base.'
  union all
  select 4, 'Does product_register_names exist?',
         case when to_regclass('public.product_register_names') is null then 'NO -- run performance.sql'
              else 'yes' end,
         'THE PICKER''S REAL SOURCE (0098). Missing, and the app falls back to paging the whole register: ~20 round trips for ~40 names.'
  union all
  select 5, '   ...is it granted to authenticated?',
         case when to_regclass('public.product_register_names') is null then 'n/a'
              when has_table_privilege('authenticated', 'public.product_register_names', 'SELECT') then 'yes'
              else 'NO -- this is the fault, and it HIDES: the app catches the error and falls back' end,
         'A view a screen reads must be granted. The omission does not error on screen -- it becomes slowness.'
  union all
  select 6, '   ...and how many names does it return?',
         case when to_regclass('public.product_register_names') is null then 'n/a'
              else (select count(*)::text from public.product_register_names) end,
         'About forty is right. Zero with a populated row 1 means the view is there and wrong.'
  union all
  select 7, 'Distinct product names in the register itself',
         (select count(distinct item_name)::text from public.products where coalesce(btrim(item_name), '') <> ''),
         'What the list SHOULD hold. If this is healthy and row 6 is not, the view is the problem, not the data.'
  union all
  select 8, 'Machines with no product name at all',
         (select count(*)::text from public.products where coalesce(btrim(item_name), '') = ''),
         'A machine is its MODEL and its serial. These cannot be offered in a product picker and cannot reach Product Database 2.0 either.'
  union all
  select 9, 'VERDICT',
         case
           when to_regclass('public.product_register_names') is null then 'THE VIEW IS MISSING -- run performance.sql'
           when not has_table_privilege('authenticated', 'public.product_register_names', 'SELECT') then 'THE VIEW IS NOT GRANTED -- grant select to authenticated'
           when (select count(*) from public.product_register_names) = 0 then 'THE VIEW IS EMPTY -- the register has no product names (row 8)'
           when (select count(*) from public.products) = 0 then 'THE REGISTER IS EMPTY'
           else 'The database side is HEALTHY -- the empty picker is on the client, not here'
         end,
         'If this says HEALTHY, the list is being lost between the database and the screen -- a failed fetch that renders as "Nothing matches".'
) rows order by n;
