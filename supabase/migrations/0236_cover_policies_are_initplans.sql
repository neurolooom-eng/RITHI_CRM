-- ===========================================================================
-- THE COVER POLICIES ARE ASKED ONCE PER QUERY, NOT ONCE PER ROW.
--
-- Found by EXPLAIN, after "Search failed: canceling statement due to statement
-- timeout" on the Product Database (2026-09-23). The plan named it exactly:
--
--   Seq Scan on contract_items ci  (actual time=16209.182..16209.182 rows=0)
--     Filter: (has_perm('cover.edit') OR has_perm('masters.view')
--              OR has_perm('cover.edit') OR is_admin())
--     Rows Removed by Filter: 20001
--
-- SIXTEEN SECONDS TO RETURN NOTHING. The predicate says nothing about the row
-- -- it is the same answer for every row in the table -- but written bare it is
-- a per-row expression, so Postgres called has_perm() four times for each of
-- 20,001 rows and each call reads app_roles.
--
-- WRAPPING IT IN A SCALAR SUBQUERY MAKES IT AN InitPlan: evaluated ONCE, at the
-- start, and the result reused. Identical semantics, identical audience --
-- nobody gains or loses a row. This project has now made the same fix three
-- times: 0095 on the hand-stock policies, 0164 on cr_read (measured at 1,840 ms
-- to 7.4 ms for an engineer), and here.
--
-- IT WAS NOT HURTING BEFORE because the cover registers always read with a
-- filter -- an SA number, a serial -- so the scan was small and 20,001
-- evaluations never happened. The Product Database reads the WHOLE install base
-- and joins these tables to it, which is what exposed it. A policy that is
-- fine until somebody writes a bigger query is not fine; it is waiting.
--
-- ALL FOUR TABLES AND BOTH POLICIES, because the write policy has the same
-- shape and the same fault -- an UPDATE over many rows pays it the same way.
-- ===========================================================================

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

    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format($f$create policy %1$s_write on public.%1$s for all
                        using ((select public.has_perm('cover.edit')))
                        with check ((select public.has_perm('cover.edit')));$f$, t);
  end loop;
end $$;
