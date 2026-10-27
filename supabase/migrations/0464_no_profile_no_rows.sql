-- ===========================================================================
-- 0464 -- NO PROFILE, NO ROWS (security scan, 2026-10-27;
-- docs/SECURITY_SCAN.md, F-02).
--
-- Many read policies say only `auth.role() = 'authenticated'` -- the Party
-- Master, the Product Database, the User Master, the master lists, the
-- settings. On a project where anybody can make a login, that is anybody. A
-- RESTRICTIVE policy is AND-ed with every other policy on its table, so one
-- named `zz_needs_a_profile` says: a caller with no profile gets nothing from
-- this table, whatever else allows. Every
-- one of the 72 live accounts has a profile (counted 2026-10-27), so nobody
-- loses anything; an unresolved login, which already held no permission
-- (0300), now also reads no row.
--
-- (select public.has_a_profile()) is an InitPlan -- asked once per query, not
-- once per row (the 0250 lesson). Definer functions and triggers run as the
-- owner and are unaffected, which is how ensure_my_profile() still makes a
-- profile for somebody who has none.
--
-- ONLY WHERE A READ POLICY SAYS "ANY SIGNED-IN USER". The first version put
-- the rule on every table, in one transaction, and the live run timed out
-- waiting for app_roles, which the app reads on almost every request (an
-- exclusive lock per table is what a policy change needs). Every other table
-- already refuses a login with no profile: its policies ask has_perm(), which
-- holds nothing without a profile (0300), or match the caller's own rows. So
-- the rule goes on each table with a permissive read policy that is only
-- `auth.role() = 'authenticated'` or `true` -- 24 of them on 2026-10-27, the
-- Party Master, Product Database, User Master, master lists and settings among
-- them. app_roles is left out: it holds which role has which permission and no
-- person's or customer's data, and it is the table the lock could not be had on.
--
-- LAST IN THE ORDER (the lockdown module) and found by its policies rather
-- than listed, so a table given such a policy later gets the rule when
-- lockdown.sql is re-run. _status.sql row 374 names any that lacks it.
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
  for r in select distinct p.tablename from pg_policies p
            where p.schemaname = 'public' and p.permissive = 'PERMISSIVE' and p.cmd in ('SELECT', 'ALL')
              and p.tablename <> 'app_roles'
              and regexp_replace(coalesce(p.qual, ''), '[()\s]|SELECT|AS role|::text', '', 'g')
                  in ('true', 'auth.role=''authenticated''')
            order by 1 loop
    execute format('drop policy if exists zz_needs_a_profile on public.%I', r.tablename);
    execute format('create policy zz_needs_a_profile on public.%I as restrictive for all to anon, authenticated using ((select public.has_a_profile())) with check ((select public.has_a_profile()))', r.tablename);
  end loop;
end $$;
