-- ===========================================================================
-- Master value lists — permission per list, not one switch for all of them.
--
-- 0008 put every master write behind a single global `masters.edit`: whoever
-- could maintain Call Type could also maintain Cancel Reason, Feedback and
-- every list added since. Roles & Permissions now lists each master as its own
-- page, so the database has to honour the same granularity:
--
--   master.<list>.edit     add / change values in that one list
--   master.<list>.delete   remove a value from that one list
--
-- `masters.edit` still grants both on every list, so no existing role loses
-- anything — it is the parent the per-list keys inherit from (mirrors can() in
-- src/lib/auth.tsx, where mod:/masters covers every mod:/masters/<key>).
--
-- Only `public.masters` is split this way. parties / products / parts are their
-- own registers with their own screens and keep the global `masters.edit`.
-- ===========================================================================

do $$
begin
  if to_regclass('public.masters') is null then
    raise notice 'public.masters is not present — run the masters bundle first';
    return;
  end if;

  -- 0008 created one FOR ALL policy; replace it with per-command policies so
  -- delete can be granted separately from add / edit.
  drop policy if exists masters_write on public.masters;
  drop policy if exists masters_admin_write on public.masters;
  drop policy if exists masters_insert on public.masters;
  drop policy if exists masters_update on public.masters;
  drop policy if exists masters_delete on public.masters;

  create policy masters_insert on public.masters for insert
    with check (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'));

  create policy masters_update on public.masters for update
    using      (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'))
    with check (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'));

  create policy masters_delete on public.masters for delete
    using      (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.delete'));
end $$;
