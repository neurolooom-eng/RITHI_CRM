-- ===========================================================================
-- DEPARTMENT ON THE USER MASTER.
--
--   The user, 2026-09-30: "Also add Department field in User Master, since the
--   scope has increased and will have to extend this app to other Department."
--
-- A column on `user_directory` (read by everyone signed in, like designation
-- and region -- a department is not private), and a MASTER LIST of the
-- departments so every screen offers the same spellings: a department typed
-- two ways splits every count and every training audience in two.
-- The list starts EMPTY -- nothing is invented; an administrator adds the
-- company's departments under Masters -> Department.
-- ===========================================================================

alter table public.user_directory add column if not exists department text not null default '';
create index if not exists user_directory_department_idx on public.user_directory (lower(department));

do $$
begin
  if to_regclass('public.master_lists') is not null then
    insert into public.master_lists (key, label, value_label, columns, sort_order)
    values ('department', 'Department', 'Department', '[]'::jsonb, 90)
    on conflict (key) do update set label = excluded.label, value_label = excluded.value_label, updated_at = now();
  end if;
end $$;
