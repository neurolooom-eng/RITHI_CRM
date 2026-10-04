-- ===========================================================================
-- 0371 — DELETING A VALUE FROM A MASTER LIST NEEDS THAT LIST'S DELETE KEY,
--        NOT "ADD / EDIT MASTER RECORDS"
--        (second re-review D-086)
--
-- masters_delete (0290, re-asserted by 0121's tail) admitted
-- masters.edit.records -- labelled "Add / edit master records (parties, parts,
-- products, lists)" -- while the list screen offers Delete only to
-- master.<list>.delete, whose parent is masters.edit. Measured: a role holding
-- masters.edit.records alone deleted a value (DELETE 1) through the API that no
-- screen offered it. A key named add / edit does not delete: the policy now
-- asks the list's own delete key or masters.edit, exactly whom the screen
-- offers it to. Add and Edit are unchanged in the database; the screen now also
-- offers Edit to masters.edit.records, as masters_update already admits.
-- 0121's guarded tail carries the same text (it is checked word for word).
-- In the masters module, after 0366.
-- ===========================================================================

drop policy if exists masters_delete on public.masters;
create policy masters_delete on public.masters for delete
    using      (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.delete'));
