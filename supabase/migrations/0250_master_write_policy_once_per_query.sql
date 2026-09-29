-- ===========================================================================
-- THE MACHINE REGISTER AND THE PARTY MASTER: A PERMISSION ASKED ONCE PER
-- QUERY, NOT ONCE PER ROW.
--
-- Reported 2026-09-29: a device downloading the machine register for a test
-- engineer sat at "0 so far" for good, and even the administrator's download
-- took about seven minutes for 11,000 machines. `_why_wont_the_machines_download.sql`
-- on the live project measured the first 1,000 machines at 322 ms as the SQL
-- editor and 24,687 ms as a signed-in user -- over the API's 20-second limit,
-- so the request was cancelled every time and the device retried for ever.
--
-- THE CAUSE IS THE *WRITE* POLICY, NOT THE READ ONE. 0008 gives products,
-- parties and parts two policies:
--
--     <t>_read   FOR SELECT  using (auth.role() = 'authenticated')
--     <t>_write  FOR ALL     using (public.has_perm('masters.edit'))
--
-- `FOR ALL` INCLUDES SELECT, and Postgres ORs every SELECT policy together --
-- so every read of these tables also asks has_perm('masters.edit'), and asks
-- it FIRST. Written bare, that is a PER-ROW call, each one reading app_roles:
-- 20,002 machines and 5,876 customers, on every page of every download. The
-- plan shows it on the scan of each table:
--
--     Filter: (has_perm('masters.edit') OR ($0 = 'authenticated'))
--
-- WRAPPED IN A SCALAR SUBQUERY -- (select has_perm(...)) -- it becomes an
-- InitPlan: worked out ONCE for the query and the answer reused, which is what
-- `_fix_product_database_timeout.sql` did for the cover tables. Measured on a
-- database loaded to the live sizes (20,002 machines, 5,876 parties, 17,689
-- contract lines), as a signed-in user, first 1,000 machines of the view the
-- device reads:
--
--     as written (bare)       ~920 ms
--     wrapped                 11-17 ms
--
-- and the Party Master page 45 ms -> 1 ms. Wrapping the READ policy instead
-- was tried first and changed nothing (~920 ms either way), which is how the
-- write policy was found; the read policy is left exactly as it is.
--
-- NOBODY GAINS OR LOSES A ROW OR A WRITE. Same function, same argument, same
-- USING and WITH CHECK -- has_perm('masters.edit') does not depend on the row,
-- so asking it once gives the answer asking it 20,000 times gave.
--
-- `masters_write` is NOT here: 0067 dropped it and replaced it with per-list
-- insert/update/delete policies.
--
-- GUARDED on each table and policy, so it is harmless on a project behind on
-- other modules; ALTER POLICY rather than drop-and-create, so there is never a
-- moment with no write policy at all.
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array['products', 'parties', 'parts'] loop
    if to_regclass('public.' || t) is not null
       and exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t and policyname = t || '_write') then
      execute format(
        'alter policy %I on public.%I using ((select public.has_perm(''masters.edit''))) '
        || 'with check ((select public.has_perm(''masters.edit'')))',
        t || '_write', t);
    end if;
  end loop;
end $$;
