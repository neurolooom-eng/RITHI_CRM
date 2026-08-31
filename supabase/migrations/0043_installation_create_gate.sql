-- ===========================================================================
-- Creating an INSTALLATION call is Commercial's job (they're notified first),
-- with the Hotline desk that registers calls, and admins. Everyone else may
-- still see and report installations, but not create one.
--
-- Enforced on installation_calls only: field_calls / pm_calls keep calls.create.
-- The calls view routes an installation insert into installation_calls, so this
-- governs the view too.
-- ===========================================================================

do $$ begin
  if to_regclass('public.installation_calls') is null then
    raise notice 'calls not split yet (0040) — run split_call_tables.sql first';
    return;
  end if;
  drop policy if exists calls_insert on public.installation_calls;
  create policy calls_insert on public.installation_calls for insert
    with check (public.has_perm('install.create'));
end $$;

-- Grant install.create to the roles that create installations (idempotent).
do $$
declare r text;
begin
  foreach r in array array['admin', 'commercial', 'hotline'] loop
    update public.app_roles
       set permissions = (
             select jsonb_agg(distinct p)
               from (
                 select jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as p
                 union select 'install.create'
               ) u
           ),
           updated_at = now()
     where role = r;
  end loop;
end $$;
