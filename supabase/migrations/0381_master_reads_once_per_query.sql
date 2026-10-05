-- ===========================================================================
-- THE MASTER READ POLICIES ASKED ONCE PER QUERY, NOT ONCE PER ROW (2026-10-05).
--
-- The user's pg_stat_statements export ("Supabase - RootCause") put two plain
-- reads of the masters among the most expensive statements on the project:
-- `products` paged by id (3,800 calls, ~6.9 s each) and `parties` (2,992
-- calls, ~3.9 s each), both with almost no disk reads -- so the time is CPU,
-- not I/O.
--
-- 0008 wrote the read policy on parties, products, parts and masters as
-- `auth.role() = 'authenticated'`, bare. Postgres evaluates a bare function in
-- a policy once per ROW, and on Supabase auth.role() reads the request's JWT
-- claims and parses them as jsonb each time. Wrapped as a sub-select it is an
-- InitPlan, asked once per statement -- the 0095 / 0250 pattern.
--
-- Measured on a database built from every migration, as `authenticated` with a
-- Supabase-shaped auth.role() and a realistic claims string, 20,000 machines:
--   one 1,000-row page at offset 19,000      147 ms  ->  27 ms
--   the product-name count (product_register_names) 106 ms -> 11 ms
-- The live figures are larger than these; the ratio is what this file claims.
--
-- WHO MAY READ IS UNCHANGED: the predicate is the same comparison, only asked
-- once. In the rbac module after 0008, before the policy tail (which does not
-- touch these), so a replay of rbac.sql ends on this definition.
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array['parties', 'products', 'parts', 'masters'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select '
                   'using ((select auth.role()) = ''authenticated'')', t);
  end loop;
end $$;
