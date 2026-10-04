-- ===========================================================================
-- 0337 — PRODUCT DATABASE 2.0'S STORED COPY IS NOT READABLE WITHOUT SIGNING IN
--        (second re-review, 2026-10-03: D-127)
--
-- 0220 revoked product_database_v2_mv from anon. 0222 drops and re-creates the
-- materialised view, grants authenticated, and never revokes anon again -- so
-- Supabase's default privileges hand it straight back, and it is the one
-- table-like object in public that the PUBLIC web key reads with no row-level
-- security: the whole install base, customers, serials and cover. Measured on a
-- database built over the Supabase grant stub: anon=arwdDxt, and the rows came
-- back to `set role anon`.
--
-- The screen reads `product_database_v2` as a signed-in user, and the refresh
-- runs as the owner (pg_cron / refresh_product_database_2), so nothing that
-- works today loses anything. Filed LAST in the product_database_2 bundle, so a
-- re-run of that bundle -- which re-creates the view -- closes it again.
-- ===========================================================================
do $$
begin
  if to_regclass('public.product_database_v2_mv') is not null then
    execute 'revoke all on public.product_database_v2_mv from anon, public';
    execute 'grant select on public.product_database_v2_mv to authenticated';
  end if;
end $$;
