-- ===========================================================================
-- WHY DOES THE MACHINE DOWNLOAD TIME OUT?
--
-- READ-ONLY. Paste into the Supabase SQL editor, change the ONE email marked
-- below to the person who saw the message, and run. It prints one grid.
--
-- Reported 2026-10-05: "Machines not on this device yet — the download stopped
-- (canceling statement due to statement timeout)", while the Party Master,
-- the standard complaints and the parts downloaded.
--
-- WHAT THE DOWNLOAD ASKS. machinestore.ts reads `public.product_database` a
-- thousand machines at a time (`select * ... where id > N order by id limit
-- 1000`). That view re-derives, ON EVERY PAGE, the contract and the
-- installation call of every machine from the whole of `contract_items` and
-- `installation_calls` (0239) -- and `installation_calls` is read under the
-- CALL visibility policy, which is per ROW. Supabase stops a signed-in
-- person's statement after a few seconds; the SQL editor does not.
--
-- WHY IT HAS TO BE MEASURED HERE. On a database built from every migration
-- and loaded to this project's order of magnitude (20,000 machines, 5,900
-- parties, 12,000 contract lines, 15,000 installation calls) one page took
-- 0.1-0.2 s as an admin and as an engineer. So the size alone does not explain
-- it, and the cause is in something only the live project has: its real data,
-- its real User Master (which the visibility rule walks), or its load.
--
-- IT BECOMES THE PERSON (the `_why_is_it_empty_2.sql` method): the same JWT
-- claims PostgREST sets and the same role, inside a transaction that ROLLS
-- BACK. The statement timeout is raised for this run only, so a slow step is
-- TIMED rather than cut off -- the number is the answer.
--
-- READ ROW 1 FIRST. "NO CLAIMS" means the email matched no profile, and every
-- timing below it was taken as nobody.
--
-- HOW TO READ THE TIMES (rows 20-25). Row 20 is the page the download asks
-- for. Rows 22-25 are its parts, each timed alone: whichever of them is close
-- to row 20 is where the time goes. Row 21 is a page from the END of the
-- register -- if it is much faster than row 20, the cost is per machine; if it
-- is the same, the cost is the per-page re-derivation.
-- ===========================================================================
begin;
set local statement_timeout = '180s';

-- THE TOTALS, measured before becoming anybody (the editor sees every row).
select set_config('rithi.n_products',  (select count(*)::text from public.products), true);
select set_config('rithi.n_parties',   (select count(*)::text from public.parties), true);
select set_config('rithi.n_contract',  (select count(*)::text from public.contract_items), true);
select set_config('rithi.n_install',   (select count(*)::text from public.installation_calls), true);
select set_config('rithi.n_directory', (select count(*)::text from public.user_directory), true);
select set_config('rithi.role_timeout',
       coalesce((select array_to_string(s.setconfig, ', ')
                   from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
                  where r.rolname = 'authenticated'), 'none set on the role'), true);
select set_config('rithi.page_end_from',
       (select coalesce(max(id) - 1000, 0)::text from public.products), true);

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
select set_config('rithi.who',
       coalesce((select p.email || ' · ' || coalesce(p.role, '') from public.profiles p
                  where p.id::text = (current_setting('request.jwt.claims', true)::json ->> 'sub')),
                '*** NO CLAIMS — the email above matched no profile ***'), true);

set local role authenticated;

-- Each step: start the clock, run it, stop the clock. `length(x::text)` reads
-- every column, so the planner cannot skip the joins the download pays for.
select set_config('rithi.t', clock_timestamp()::text, true);
select set_config('rithi.page1_n', (select count(*)::text || ' rows, ' || coalesce(sum(length(x::text)), 0)::text || ' chars'
         from (select * from public.product_database where id > 0 order by id limit 1000) x), true);
select set_config('rithi.page1_ms', round(extract(epoch from clock_timestamp() - current_setting('rithi.t')::timestamptz) * 1000)::text, true);

select set_config('rithi.t', clock_timestamp()::text, true);
select set_config('rithi.page2_n', (select count(*)::text
         from (select * from public.product_database
                where id > current_setting('rithi.page_end_from')::bigint order by id limit 1000) x
        where length(x::text) > 0), true);
select set_config('rithi.page2_ms', round(extract(epoch from clock_timestamp() - current_setting('rithi.t')::timestamptz) * 1000)::text, true);

select set_config('rithi.t', clock_timestamp()::text, true);
select set_config('rithi.inst_n', (select count(*)::text from public.installation_calls c
        where c.cancelled_at is null and length(coalesce(c.product_name, '') || coalesce(c.serial, '')) >= 0), true);
select set_config('rithi.inst_ms', round(extract(epoch from clock_timestamp() - current_setting('rithi.t')::timestamptz) * 1000)::text, true);

select set_config('rithi.t', clock_timestamp()::text, true);
select set_config('rithi.contract_n', (select count(*)::text from public.contract_items ci
        join public.contract_entries ce on ce.mc_number = ci.mc_number), true);
select set_config('rithi.contract_ms', round(extract(epoch from clock_timestamp() - current_setting('rithi.t')::timestamptz) * 1000)::text, true);

select set_config('rithi.t', clock_timestamp()::text, true);
select set_config('rithi.products_n', (select count(*)::text
         from (select * from public.products where id > 0 order by id limit 1000) x where length(x::text) > 0), true);
select set_config('rithi.products_ms', round(extract(epoch from clock_timestamp() - current_setting('rithi.t')::timestamptz) * 1000)::text, true);

select set_config('rithi.t', clock_timestamp()::text, true);
select set_config('rithi.team_n', (select count(*)::text from public.visible_engineer_names()), true);
select set_config('rithi.team_ms', round(extract(epoch from clock_timestamp() - current_setting('rithi.t')::timestamptz) * 1000)::text, true);

select * from (values (0, '— AS THIS USER, NOT AS THE ADMIN —', '')) v(n, "check", answer)
union all select 1,  'who this ran as', current_setting('rithi.who', true)
union all select 2,  'the signed-in role''s own settings (statement timeout)', current_setting('rithi.role_timeout', true)
union all select 3,  'sees every call (office role or data.view_all)', coalesce((select public.can_view_all_calls())::text, 'NULL')
union all select 10, 'machines in the register', current_setting('rithi.n_products', true)
union all select 11, 'parties', current_setting('rithi.n_parties', true)
union all select 12, 'contract lines', current_setting('rithi.n_contract', true)
union all select 13, 'installation calls', current_setting('rithi.n_install', true)
union all select 14, 'User Master rows (walked by the visibility rule)', current_setting('rithi.n_directory', true)
union all select 20, 'ONE DOWNLOAD PAGE, the first: ms', current_setting('rithi.page1_ms', true) || '  (' || current_setting('rithi.page1_n', true) || ')'
union all select 21, 'one download page, the last: ms', current_setting('rithi.page2_ms', true) || '  (' || current_setting('rithi.page2_n', true) || ' rows)'
union all select 22, '   its installation calls, read as this person: ms', current_setting('rithi.inst_ms', true) || '  (' || current_setting('rithi.inst_n', true) || ' visible)'
union all select 23, '   its contract lines: ms', current_setting('rithi.contract_ms', true) || '  (' || current_setting('rithi.contract_n', true) || ' visible)'
union all select 24, '   its machines alone: ms', current_setting('rithi.products_ms', true) || '  (' || current_setting('rithi.products_n', true) || ' rows)'
union all select 25, '   this person''s team (visible_engineer_names): ms', current_setting('rithi.team_ms', true) || '  (' || current_setting('rithi.team_n', true) || ' names)'
order by 1;

rollback;
