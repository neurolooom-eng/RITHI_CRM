-- ===========================================================================
-- NSM is the National SERVICE Manager, not the National Sales Manager.
--
-- 0008 seeded the label, and its upsert deliberately keeps a label an admin has
-- already set (`coalesce(nullif(existing.label,''), excluded.label)`) — so
-- correcting the seed does nothing to a project where the row already exists.
-- This corrects the stored label in place, and ONLY that exact wording, so a
-- name an admin chose themselves is left alone.
-- ===========================================================================

do $$
begin
  if to_regclass('public.app_roles') is null then
    raise notice 'public.app_roles is not present — run the rbac bundle first';
    return;
  end if;

  update public.app_roles
     set label = 'NSM (National Service Manager)', updated_at = now()
   where role = 'nsm'
     and label = 'NSM (National Sales Manager)';
end $$;
