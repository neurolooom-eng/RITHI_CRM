-- ===========================================================================
-- 0347 — CUSTOMER FEEDBACK ASKS THE PERMISSION ONCE PER QUERY (D-132), AND NO
--        SIGNED-IN USER DELETES A MACHINE THROUGH THE API (D-139)
--        (second re-review, 2026-10-03)
--
-- D-132. fb_read and fb_write (0286) call has_perm() bare, so Postgres asks it
-- once per ROW -- the 0250 fault. Measured over 30,000 feedback rows as an
-- engineer: 12,356 ms; with the checks wrapped, 4.9 ms. Wrapped here in a
-- sub-select, which is asked once per query. WHO may read and write is
-- unchanged, word for word. fb_update is owned by data_integrity (0288) and is
-- wrapped there by 0348, so a replay of either bundle keeps its own.
--
-- D-139. products_write (0286) is FOR ALL under masters.edit.records, so the
-- records key could DELETE machines -- measured: DELETE 1 -- although 0325
-- took the API delete away from that key on parties and parts. Split here
-- into INSERT and UPDATE on the same key, with NO delete policy: no screen
-- deletes a machine (deleteMasterRecord covers parties, parts and product
-- lines only), and the Product Database clean-ups that do
-- (_rebuild_product_database.sql, _dedupe_part_product_keys.sql) run in the
-- SQL editor, where row-level security does not apply. The uploads upsert,
-- which is an INSERT and an UPDATE, and keep working.
--
-- 0250 alters products_write only where it exists, so a replay of this bundle
-- re-creates it at 0286 and this file then splits it again.
-- In the rbac module, after 0325 and before the policy tail.
-- ===========================================================================

drop policy if exists fb_read  on public.feedback;
drop policy if exists fb_write on public.feedback;
create policy fb_read on public.feedback for select
  using ((select public.has_perm('feedback.view')) or (select public.has_perm('visit.feedback')));
create policy fb_write on public.feedback for insert
  with check ((select public.has_perm('visit.feedback')) or (select public.has_perm('feedback.view')));

do $$
begin
  if to_regclass('public.products') is null then return; end if;
  drop policy if exists products_write  on public.products;
  drop policy if exists products_insert on public.products;
  drop policy if exists products_update on public.products;
  create policy products_insert on public.products for insert
    with check ((select public.has_perm('masters.edit.records')));
  create policy products_update on public.products for update
    using ((select public.has_perm('masters.edit.records')))
    with check ((select public.has_perm('masters.edit.records')));
end $$;
