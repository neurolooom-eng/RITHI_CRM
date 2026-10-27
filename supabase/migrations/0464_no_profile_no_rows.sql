-- ===========================================================================
-- 0464 -- NO PROFILE, NO ROWS (security scan, 2026-10-27;
-- docs/SECURITY_SCAN.md, F-02).
--
-- Many read policies say only `auth.role() = 'authenticated'` -- the Party
-- Master, the Product Database, the User Master, the master lists, the
-- settings. On a project where anybody can make a login, that is anybody. A
-- RESTRICTIVE policy is AND-ed with every other policy on its table, so one
-- named `zz_needs_a_profile` on every table with row-level security says: a
-- caller with no profile gets nothing from it, whatever else allows. Every
-- one of the 72 live accounts has a profile (counted 2026-10-27), so nobody
-- loses anything; an unresolved login, which already held no permission
-- (0300), now also reads no row.
--
-- (select public.has_a_profile()) is an InitPlan -- asked once per query, not
-- once per row (the 0250 lesson). Definer functions and triggers run as the
-- owner and are unaffected, which is how ensure_my_profile() still makes a
-- profile for somebody who has none.
--
-- LAST IN THE ORDER (the lockdown module) and attached to EVERY table with
-- row-level security that exists when it runs -- re-run lockdown.sql after a
-- new table, as with sys_columns.sql. _status.sql row 374 counts the tables
-- without it.
-- ===========================================================================
create or replace function public.has_a_profile()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.profiles where id = auth.uid());
$$;
revoke all on function public.has_a_profile() from public;
grant execute on function public.has_a_profile() to anon, authenticated;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity loop
    execute format('drop policy if exists zz_needs_a_profile on public.%I', r.relname);
    execute format('create policy zz_needs_a_profile on public.%I as restrictive for all to anon, authenticated using ((select public.has_a_profile())) with check ((select public.has_a_profile()))', r.relname);
  end loop;
end $$;
