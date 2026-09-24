-- ===========================================================================
-- "Search failed: canceling statement due to statement timeout"
-- on the Product Database.  RUN THIS FILE.  It takes under a second.
--
-- Reported 2026-09-24 by a Commercial user searching the install base for
-- 1691.  The register came back empty behind the banner and the search box
-- kept what was typed, so it reads as a broken screen rather than a slow one.
--
-- WHAT IS WRONG.  The Product Database joins the contract register and the
-- installation calls to every machine.  The read policy on the cover tables is
-- written BARE --
--
--     using (has_perm('masters.view') or has_perm('cover.edit') or is_admin())
--
-- -- and a bare call is a PER-ROW expression.  It says nothing about the row
-- (it is the same answer for every row in the table), but Postgres cannot know
-- that, so it asks it again for each of 20,000 contract lines, and each ask
-- reads app_roles.  Supabase stops a statement at eight seconds.
--
-- WRAPPING IT IN A SCALAR SUBQUERY -- (select has_perm(...)) -- makes it an
-- InitPlan: worked out ONCE at the start of the query and the answer reused.
--
-- NOBODY GAINS OR LOSES A ROW.  Same functions, same arguments, same OR.  This
-- is a performance fix and not a permissions change; it does not touch Roles &
-- Permissions and no role's reach changes by one record.
--
-- MEASURED on 20,002 machines, 40,006 contract lines and 15,004 installation
-- calls, read as a Commercial user through RLS:
--
--     the search in the screenshot   7,695 ms  ->  184 ms
--     the register's opening page    7,892 ms  ->  218 ms
--     a party contains-match         7,984 ms  ->  1,058 ms
--
-- THIS IS MIGRATION 0236 AND NOTHING ELSE.  It is here as a file of its own
-- because running the sales_contracts bundle to apply it re-executes
-- seventeen migrations and deadlocked against the live app twice.
--
-- lock_timeout IS THE POINT OF THAT.  create policy takes an ACCESS EXCLUSIVE
-- lock on the table -- briefly, but it must WAIT for it, and waiting behind a
-- long read while the app queues up behind you is how the deadlock happened.
-- At four seconds this gives up and says so instead, and you run it again.
-- It is idempotent: a re-run replaces the same four policies with the same
-- four policies.
-- ===========================================================================

set lock_timeout = '4s';
set statement_timeout = '120s';

do $$
declare t text;
begin
  foreach t in array array['sale_entries', 'sale_items', 'contract_entries', 'contract_items'] loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format($f$create policy %1$s_read on public.%1$s for select
                        using ((select public.has_perm('masters.view'))
                            or (select public.has_perm('cover.edit'))
                            or (select public.is_admin()));$f$, t);

    -- The write policy has the same shape and the same fault: an UPDATE over
    -- many rows -- which is what "Force Update Child Records" is -- pays it
    -- exactly the same way.
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format($f$create policy %1$s_write on public.%1$s for all
                        using ((select public.has_perm('cover.edit')))
                        with check ((select public.has_perm('cover.edit')));$f$, t);
  end loop;
end $$;

-- One statement, one grid -- the Supabase SQL editor shows the last result and
-- nothing else, so the report is a query rather than a run of notices.
--
-- ASKED OF THE POLICY AS POSTGRES RENDERS IT, not of what this file just ran:
-- an InitPlan renders as `( SELECT has_perm(...) AS has_perm)` and the per-row
-- form as a bare `has_perm(...)`, so the grid reads the state of the database
-- rather than repeating the intention of the script above it.
--
-- IT COUNTS THE CALLS RATHER THAN LOOKING FOR ONE, and that is not fussiness:
-- "contains SELECT has_perm" passes a policy with ONE branch wrapped and the
-- other left bare -- which is exactly what a later migration editing one
-- branch produces, and it is still slow. Proved by building that policy and
-- watching the two tests disagree. Both halves of a write policy are read,
-- since `with check` is evaluated per row on an UPDATE the same way.
select
  p.polrelid::regclass::text as "table",
  p.polname                  as "policy",
  case when n.bare = 0 then 'asked ONCE per query'
       else 'ASKED ONCE PER ROW  <-- still slow' end as "verdict",
  e.expr                     as "as postgres renders it"
from pg_policy p
cross join lateral (select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' '
                        || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr) e
cross join lateral (select
    (select count(*) from regexp_matches(e.expr, 'has_perm\(', 'g'))
  - (select count(*) from regexp_matches(e.expr, 'SELECT has_perm\(', 'g'))
  + (select count(*) from regexp_matches(e.expr, 'is_admin\(', 'g'))
  - (select count(*) from regexp_matches(e.expr, 'SELECT is_admin\(', 'g')) as bare) n
where p.polrelid in ('public.sale_entries'::regclass, 'public.sale_items'::regclass,
                     'public.contract_entries'::regclass, 'public.contract_items'::regclass)
order by n.bare desc, 1, 2;
