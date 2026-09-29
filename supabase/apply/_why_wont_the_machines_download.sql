-- ===========================================================================
-- WHY DOES THE MACHINE REGISTER NOT DOWNLOAD FOR THIS PERSON?
--
-- READ-ONLY. Paste into the Supabase SQL editor, change the ONE email marked
-- below, and run. It prints one grid. Everything runs inside one transaction
-- that ROLLS BACK, so nothing is written and the role change does not outlive
-- the query.
--
-- REPORTED 2026-09-29: signed in as TEST Engineer (test_er@gmail.com) the line
-- read "Downloading machines to this device... 0 so far" and never moved, while
-- the customers (5,876) downloaded in seconds. Signed in as
-- service.almsind@gmail.com the machine count climbed normally.
--
-- WHAT THE DEVICE ASKS FOR is exactly this, a thousand machines at a time:
--     select * from product_database where id > <last> order by id limit 1000
-- and the browser is refused anything that takes longer than the API's
-- statement timeout for signed-in users (8 seconds on Supabase unless it has
-- been changed). "0 so far" means the FIRST such request has not succeeded.
--
-- SO THIS RUNS THAT EXACT READ TWICE -- once as the SQL editor (which is how
-- the administrator's read behaves) and once AS THE PERSON -- and times both.
-- It also times the Party Master, which downloaded fine, as the control.
--
-- HOW TO READ IT
--   * row 1 must print the person's email. If it says NO CLAIMS, you did not
--     change the email line: it defaults to CHANGE-ME@example.com on purpose.
--   * rows 3 and 4: the milliseconds for the first thousand machines. If the
--     person's figure (4) is over ~8,000 and the editor's (3) is not, the read
--     is timing out FOR THEM and the fault is the view's speed under their
--     row-level security, not the device.
--   * rows 6 and 7: the contract lines the person can read beside how many
--     exist. The view works out Item Status from those lines, so if the person
--     reads NONE, every machine under contract reads to them as
--     "CONTRACT (TYPE NOT RECORDED)" rather than AMC or CMC -- a separate
--     fault, and one worth knowing about before trusting the offline copy.
--   * row 8: the API's timeout as configured for signed-in users.
-- ===========================================================================
begin;

-- AS THE SQL EDITOR (no row-level security): the control figures.
select set_config('rithi.t0', clock_timestamp()::text, true);
select set_config('rithi.editor_rows',
       (select count(*)::text from (select * from public.product_database where id > 0 order by id limit 1000) s), true);
select set_config('rithi.t1', clock_timestamp()::text, true);
select set_config('rithi.all_contract_lines', (select count(*)::text from public.contract_items), true);
select set_config('rithi.api_timeout',
       coalesce((select array_to_string(r.rolconfig, ', ') from pg_roles r where r.rolname = 'authenticated'), 'not set on the role'), true);

-- Become the person.
select set_config('request.jwt.claims',
  (select json_build_object(
            'sub',   p.id,
            'email', p.email,
            'role',  'authenticated')::text
     from public.profiles p
     -- >>> CHANGE THIS ONE LINE
    where lower(p.email) = lower('CHANGE-ME@example.com')
    limit 1), true);

set local role authenticated;

select set_config('rithi.t2', clock_timestamp()::text, true);
select set_config('rithi.user_rows',
       (select count(*)::text from (select * from public.product_database where id > 0 order by id limit 1000) s), true);
select set_config('rithi.t3', clock_timestamp()::text, true);
select set_config('rithi.party_rows',
       (select count(*)::text from (select * from public.parties where id > 0 order by id limit 1000) s), true);
select set_config('rithi.t4', clock_timestamp()::text, true);

select * from (values (0, '--- the first page of the machine download, timed ---', '')) v(n, "check", answer)
union all
select 1, 'the database agrees who I am',
       coalesce(nullif(current_setting('request.jwt.claims', true), ''), '*** NO CLAIMS - the email above matched no profile ***')
union all
select 2, 'first 1,000 machines: rows returned (editor / this person)',
       current_setting('rithi.editor_rows', true) || ' / ' || current_setting('rithi.user_rows', true)
union all
select 3, 'first 1,000 machines as the SQL editor: milliseconds',
       round(extract(epoch from (current_setting('rithi.t1')::timestamptz - current_setting('rithi.t0')::timestamptz)) * 1000)::text
union all
select 4, 'first 1,000 machines AS THIS PERSON: milliseconds',
       round(extract(epoch from (current_setting('rithi.t3')::timestamptz - current_setting('rithi.t2')::timestamptz)) * 1000)::text
union all
select 5, 'first 1,000 customers AS THIS PERSON (the control): milliseconds',
       round(extract(epoch from (current_setting('rithi.t4')::timestamptz - current_setting('rithi.t3')::timestamptz)) * 1000)::text
         || ' ms, ' || current_setting('rithi.party_rows', true) || ' rows'
union all
select 6, 'contract lines this person can read',
       (select count(*)::text from public.contract_items)
union all
select 7, '   ...and how many exist',
       current_setting('rithi.all_contract_lines', true)
union all
select 8, 'API settings for signed-in users (statement_timeout)',
       current_setting('rithi.api_timeout', true)
union all
select 9, 'do I hold masters.view (the contract registers'' read right)',
       (select coalesce(public.has_perm('masters.view')::text, 'NULL'))
order by 1;

rollback;
