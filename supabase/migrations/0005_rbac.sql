-- ===========================================================================
-- RBAC — role → allowed actions, editable by admins. The app reads app_roles
-- and enforces can(action) against the signed-in user's profiles.role.
-- ===========================================================================

create table if not exists public.app_roles (
  role        text primary key,
  label       text default '',
  permissions jsonb not null default '[]',   -- array of action keys
  updated_at  timestamptz not null default now()
);

-- Seed the roles (permissions left empty here; the app fills sensible defaults
-- on first save). Admins edit these in Admin → Roles & Permissions.
insert into public.app_roles (role, label) values
  ('admin', 'Admin / Super Admin'),
  ('rgm', 'Regional Manager'),
  ('rm', 'Reporting Manager'),
  ('engineer', 'Engineer'),
  ('hotline', 'Hotline Engineer'),
  ('spare_coordinator', 'Spare Coordinator'),
  ('tally_coordinator', 'Tally Coordinator')
on conflict (role) do nothing;

alter table public.app_roles enable row level security;
drop policy if exists ar_read on public.app_roles;
create policy ar_read on public.app_roles for select using (auth.role() = 'authenticated');
drop policy if exists ar_admin_write on public.app_roles;
create policy ar_admin_write on public.app_roles for all using (public.is_admin()) with check (public.is_admin());

-- Allow assigning any of the seven roles to a profile (text column, no enum).
-- (profiles.role already text; no change needed.)
