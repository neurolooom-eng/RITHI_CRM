-- ===========================================================================
-- 0325 — PRODUCT MASTER AND THE VALUE LISTS: ADD, EDIT AND DELETE KEYS
--
-- The user, 2026-10-03: "One add, one edit, one delete per master" -- the
-- masters-module half of 0325_party_part_add_edit_delete.sql (rbac), which
-- holds the parents and master_delete_guard().
--
--   Product Master   masters.product_master.add / .edit / .delete, split out
--                    of pm_write (FOR ALL under masters.edit.records, 0290).
--                    A line is refused deletion while a machine, a sale or a
--                    contract names its code -- the same guard as a party.
--   A value list     master.<list>.add joins master.<list>.edit and
--                    master.<list>.delete. Adding asks the add key OR the
--                    list's edit key (its parent, as everywhere else: a role
--                    that could add values yesterday still can) OR
--                    masters.edit.records, exactly as before. Edit -- which
--                    now includes RENAMING a value, the user's choice -- and
--                    delete are unchanged.
--
-- No grant is changed.
-- ===========================================================================

drop policy if exists pm_write on public.product_master;
drop policy if exists pm_insert on public.product_master;
drop policy if exists pm_update on public.product_master;
drop policy if exists pm_delete on public.product_master;
create policy pm_insert on public.product_master for insert
  with check ((select public.has_perm('masters.product_master.add')));
create policy pm_update on public.product_master for update
  using ((select public.has_perm('masters.product_master.edit')))
  with check ((select public.has_perm('masters.product_master.edit')));
create policy pm_delete on public.product_master for delete
  using ((select public.has_perm('masters.product_master.delete')));

drop trigger if exists master_delete_guard on public.product_master;
create trigger master_delete_guard before delete on public.product_master
  for each row execute function public.master_delete_guard();

drop policy if exists masters_insert on public.masters;
create policy masters_insert on public.masters for insert
    with check (public.has_perm('masters.edit.records')
             or public.has_perm('master.' || coalesce(name, '') || '.add')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'));
