-- ===========================================================================
-- Per-user access: a user gets their ROLE's permissions plus any extra actions
-- granted directly to them. (profiles.role already exists.)
-- ===========================================================================

alter table public.profiles
  add column if not exists extra_permissions jsonb not null default '[]';

-- profiles already has:
--   profiles_self_read  (self or admin can read)
--   profiles_admin_write (admins can insert/update/delete)
-- so admins can set role + extra_permissions from the User Access screen.
