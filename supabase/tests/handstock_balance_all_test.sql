-- ===========================================================================
-- handstock_balance_all() (0384): the whole balance in one request, and
-- NOT ONE LINE MORE than the view would show the same reader.
--
-- The function is security invoker, so the reader's row-level security
-- bounds every arm exactly as it bounds `handstock_balance`. This proves it:
-- for an engineer the array holds exactly the view's rows for that engineer,
-- for an administrator exactly the view's rows for everybody -- and the
-- public key is refused. Expected ERRORs are labelled; the harness pairs each
-- with the next error in order.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('ba100000-0000-0000-0000-000000000001', 'hsba-admin@x.com'),
  ('ba100000-0000-0000-0000-000000000002', 'hsba-eng-a@x.com'),
  ('ba100000-0000-0000-0000-000000000003', 'hsba-eng-b@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('ba100000-0000-0000-0000-000000000001', 'hsba-admin@x.com', 'HSBA Admin', 'admin'),
  ('ba100000-0000-0000-0000-000000000002', 'hsba-eng-a@x.com', 'HSBA Eng A', 'engineer'),
  ('ba100000-0000-0000-0000-000000000003', 'hsba-eng-b@x.com', 'HSBA Eng B', 'engineer')
on conflict do nothing;
insert into public.user_directory (name, email, role) values
  ('HSBA Eng A', 'hsba-eng-a@x.com', 'engineer'),
  ('HSBA Eng B', 'hsba-eng-b@x.com', 'engineer');
create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
grant select on public.harness to anon, authenticated;

-- Opening stock for two engineers: the arm with the fewest guards. The upload
-- marker lets the opening in without a dispatch behind it.
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
  ('HSBA Eng A', 'HSBA-P1|Part one', 3, date '2025-01-01', 'hsba'),
  ('HSBA Eng A', 'HSBA-P2|Part two', 1, date '2025-01-01', 'hsba'),
  ('HSBA Eng B', 'HSBA-P1|Part one', 5, date '2025-01-01', 'hsba')
on conflict do nothing;

\echo ''
\echo '--- 1. NOT SIGNED IN: refused ---'
update public.harness set uid = null, email = null;
set role anon;
\echo 'expect ERROR: permission denied for function handstock_balance_all'
select public.handstock_balance_all();
reset role;

\echo ''
\echo '--- 2. ENGINEER A: exactly the view''s rows for A, and none of B''s ---'
call public.be('hsba-eng-a@x.com');
set role authenticated;
select 'engineer A' as who,
       jsonb_array_length(public.handstock_balance_all()) as in_the_array,
       (select count(*) from public.handstock_balance) as in_the_view,
       (jsonb_array_length(public.handstock_balance_all()) = (select count(*) from public.handstock_balance))::text as same_should_be_true,
       (select count(*) from jsonb_array_elements(public.handstock_balance_all()) e
         where e->>'engineer_key' = 'hsba eng b') as b_lines_should_be_0,
       (select count(*) from jsonb_array_elements(public.handstock_balance_all()) e
         where e->>'part_code' like 'HSBA-%') as own_lines_should_be_2;
reset role;

\echo ''
\echo '--- 3. ADMINISTRATOR: everybody, in engineer then part order ---'
call public.be('hsba-admin@x.com');
set role authenticated;
select 'admin' as who,
       (jsonb_array_length(public.handstock_balance_all()) = (select count(*) from public.handstock_balance))::text as same_as_view_should_be_true,
       (select count(*) from jsonb_array_elements(public.handstock_balance_all()) e
         where e->>'part_code' like 'HSBA-%') as hsba_lines_should_be_3,
       (select string_agg(e->>'engineer' || '/' || (e->>'part_code'), ', ' order by o)
          from jsonb_array_elements(public.handstock_balance_all()) with ordinality as x(e, o)
         where e->>'part_code' like 'HSBA-%') as in_order;
reset role;
