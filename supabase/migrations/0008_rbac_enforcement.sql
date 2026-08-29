-- ===========================================================================
-- RBAC — server-side enforcement.
--
-- Until now the role → action matrix (app_roles, edited in Admin → Roles &
-- Permissions) was only honoured by the browser: can(action) hid buttons and
-- blocked routes, but Postgres itself let any authenticated user write any
-- row it could reach. Anyone with the anon key and a login could bypass the UI.
--
-- This migration moves the same matrix into the database:
--   * has_perm('<action>') resolves the signed-in user's role against
--     app_roles.permissions — the very rows the admin UI edits.
--   * app_roles is seeded with the app's DEFAULT_PERMS (src/lib/rbac.ts) so
--     the matrix is never empty (an empty matrix would lock everyone out).
--   * every RLS policy that previously said "authenticated" or "is_admin()"
--     now names the action it needs.
--   * spare_requests approval columns are guarded per stage by a trigger,
--     since RLS cannot express "may change these columns only".
--
-- Keep this file in sync with src/lib/rbac.ts when actions/roles change.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Super admins — the dev/support logins that always hold every right (mirrors
-- SUPER_ADMINS in src/lib/auth.tsx). A table, so it can be edited in SQL
-- without a code deploy.
-- ---------------------------------------------------------------------------
create table if not exists public.app_super_admins (
  email      text primary key,
  created_at timestamptz not null default now()
);
insert into public.app_super_admins (email) values
  ('service.almsind@gmail.com'),
  ('devika.m@airliquide.com'),
  ('devikamunusamy@gmail.com'),
  ('mmdev74@gmail.com')
on conflict (email) do nothing;

alter table public.app_super_admins enable row level security;
drop policy if exists asa_read on public.app_super_admins;
create policy asa_read on public.app_super_admins for select using (public.is_admin());
-- No write policy: the list is maintained in SQL only (service role / SQL editor).

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_super_admins s where lower(s.email) = lower(coalesce(auth.email(), ''))
  );
$$;

-- Admin = profiles.role 'admin', or a super admin login.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) or public.is_super_admin();
$$;

-- The signed-in user's RBAC role key (profiles.role), defaulting to engineer.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(lower(trim(p.role)), ''), 'engineer')
    from public.profiles p where p.id = auth.uid();
$$;

-- The extra actions granted to this user directly, on top of their role
-- (profiles.extra_permissions — see 0007_user_access.sql).
create or replace function public.my_extra_perms()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(p.extra_permissions, '[]'::jsonb) from public.profiles p where p.id = auth.uid();
$$;

-- Does the signed-in user hold `action`? Admins and super admins hold every
-- action. Otherwise the action must appear in app_roles.permissions for their
-- role, or in their own extra_permissions; a role with no row (or an empty
-- array) falls back to 'engineer' so a half-configured matrix degrades to
-- least privilege rather than lock-out.
create or replace function public.has_perm(action text)
returns boolean language sql stable security definer set search_path = public as $$
  with role_row as (
    select r.permissions from public.app_roles r
     where r.role = public.my_role() and jsonb_array_length(coalesce(r.permissions, '[]'::jsonb)) > 0
  ),
  fallback as (
    select r.permissions from public.app_roles r where r.role = 'engineer'
  ),
  perms as (
    select permissions from role_row
    union all
    select permissions from fallback where not exists (select 1 from role_row)
  )
  select public.is_admin()
      or exists (select 1 from perms p where p.permissions ? action)
      or public.my_extra_perms() ? action;
$$;

grant execute on function public.is_super_admin()  to authenticated;
grant execute on function public.my_role()         to authenticated;
grant execute on function public.my_extra_perms()  to authenticated;
grant execute on function public.has_perm(text)    to authenticated;

-- ---------------------------------------------------------------------------
-- Seed app_roles with the app's starting matrix (src/lib/rbac.ts DEFAULT_PERMS)
-- so enforcement has something to enforce. Roles that already carry a
-- non-empty permission list are left untouched — admin edits win.
-- ---------------------------------------------------------------------------
do $$
declare
  admin_mods text[] := array['mod:/users','mod:/roles','mod:/admin-config'];
  open_mods  text[] := array[
    'mod:/','mod:/daily-review','mod:/parties','mod:/product-master','mod:/user-master',
    'mod:/parts','mod:/warranties','mod:/contracts','mod:/request-registration',
    'mod:/pending-registrations','mod:/field-calls','mod:/installations','mod:/pm-calls',
    'mod:/reports','mod:/spare-requests','mod:/spare-consumption','mod:/feedback',
    'mod:/failure-report','mod:/kpi','mod:/settings','mod:/version-history'];
  all_actions text[] := array[
    'calls.view','calls.create','calls.edit','calls.report','request.create','pending.register',
    'spare.request','spare.approve_rm','spare.approve_commercial','spare.approve_nsm','spare.dispatch',
    'consumption.view','masters.view','masters.edit','reports.view','dashboard.view','feedback.view',
    'users.manage','config.manage','rbac.manage'];
  defs jsonb := jsonb_build_object(
    'admin',             to_jsonb(all_actions || open_mods || admin_mods),
    'nsm',               to_jsonb(array['calls.view','masters.view','consumption.view','reports.view','dashboard.view','feedback.view','spare.approve_nsm'] || open_mods),
    'rgm',               to_jsonb(array['calls.view','calls.create','calls.edit','calls.report','request.create','spare.request','spare.approve_rm','consumption.view','masters.view','reports.view','dashboard.view','feedback.view'] || open_mods),
    'rm',                to_jsonb(array['calls.view','calls.create','calls.edit','calls.report','request.create','spare.request','spare.approve_rm','consumption.view','masters.view','reports.view','dashboard.view','feedback.view'] || open_mods),
    'engineer',          to_jsonb(array['calls.view','calls.report','request.create','spare.request','consumption.view','reports.view','dashboard.view'] || open_mods),
    'hotline',           to_jsonb(array['calls.view','calls.create','request.create','pending.register','spare.approve_rm','masters.view','dashboard.view'] || open_mods),
    'spare_coordinator', to_jsonb(array['calls.view','spare.request','spare.approve_rm','spare.dispatch','consumption.view','reports.view','dashboard.view'] || open_mods),
    'stores_incharge',   to_jsonb(array['calls.view','spare.dispatch','consumption.view','reports.view','dashboard.view'] || open_mods),
    'tally_coordinator', to_jsonb(array['calls.view','consumption.view','reports.view','feedback.view','dashboard.view'] || open_mods),
    'commercial',        to_jsonb(array['calls.view','consumption.view','reports.view','feedback.view','dashboard.view','masters.view','spare.approve_commercial'] || open_mods)
  );
  labels jsonb := jsonb_build_object(
    'admin','Admin / Super Admin', 'nsm','NSM (National Sales Manager)', 'rgm','Regional Manager',
    'rm','Reporting Manager', 'engineer','Engineer', 'hotline','Hotline Engineer',
    'spare_coordinator','Spare Coordinator', 'stores_incharge','Stores Incharge',
    'tally_coordinator','Tally Coordinator', 'commercial','Commercial');
  k text;
begin
  for k in select jsonb_object_keys(defs) loop
    insert into public.app_roles (role, label, permissions)
    values (k, labels ->> k, defs -> k)
    on conflict (role) do update
      set label       = coalesce(nullif(public.app_roles.label, ''), excluded.label),
          permissions = case
                          when jsonb_array_length(coalesce(public.app_roles.permissions, '[]'::jsonb)) = 0
                          then excluded.permissions
                          else public.app_roles.permissions
                        end,
          updated_at  = now();
  end loop;
end $$;

-- ===========================================================================
-- Policies — each one now names the action it requires.
-- ===========================================================================

-- profiles: own row always readable; managing users needs users.manage.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select
  using (id = auth.uid() or public.is_admin() or public.has_perm('users.manage'));
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

-- Masters & catalog: reference data every signed-in user needs to fill a call
-- in (parties, products, parts, value lists), so reads stay open to any
-- authenticated user; changing a master needs masters.edit.
do $$
declare t text;
begin
  foreach t in array array['parties','products','parts','masters'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format('create policy %1$s_read on public.%1$s for select using (auth.role() = ''authenticated'');', t);
    execute format('drop policy if exists %1$s_admin_write on public.%1$s;', t);
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format('create policy %1$s_write on public.%1$s for all using (public.has_perm(''masters.edit'')) with check (public.has_perm(''masters.edit''));', t);
  end loop;
end $$;

-- user_directory: readable by anyone who may see calls (it drives the
-- reporting tree); maintained by user managers.
drop policy if exists ud_read on public.user_directory;
create policy ud_read on public.user_directory for select using (auth.role() = 'authenticated');
drop policy if exists ud_admin_write on public.user_directory;
drop policy if exists ud_write on public.user_directory;
create policy ud_write on public.user_directory for all
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

-- app_roles: everyone reads the matrix (the client needs it to gate the UI);
-- only rbac.manage may change it.
drop policy if exists ar_read on public.app_roles;
create policy ar_read on public.app_roles for select using (auth.role() = 'authenticated');
drop policy if exists ar_admin_write on public.app_roles;
drop policy if exists ar_write on public.app_roles;
create policy ar_write on public.app_roles for all
  using (public.has_perm('rbac.manage')) with check (public.has_perm('rbac.manage'));

-- calls: the reporting-tree scope still applies, on top of the action.
drop policy if exists calls_scoped_read on public.calls;
create policy calls_scoped_read on public.calls for select
  using (public.has_perm('calls.view') and public.can_see_call(allocated_to));
drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls for insert
  with check (public.has_perm('calls.create'));
drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update
  using ((public.has_perm('calls.edit') or public.has_perm('calls.report')) and public.can_see_call(allocated_to))
  with check ((public.has_perm('calls.edit') or public.has_perm('calls.report')) and public.can_see_call(allocated_to));

-- pending registrations: Hotline registers them; scope still applies to reads.
drop policy if exists pend_read on public.pending_registrations;
create policy pend_read on public.pending_registrations for select
  using (public.is_admin() or created_by = auth.uid()
    or (public.has_perm('calls.view')
        and lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n))));
drop policy if exists pend_insert on public.pending_registrations;
create policy pend_insert on public.pending_registrations for insert
  with check (public.has_perm('pending.register') or public.has_perm('request.create'));
drop policy if exists pend_update on public.pending_registrations;
create policy pend_update on public.pending_registrations for update
  using (public.has_perm('pending.register') or public.has_perm('calls.create'))
  with check (public.has_perm('pending.register') or public.has_perm('calls.create'));

-- call requests: raising one needs request.create; acting on one needs
-- calls.create (the Hotline/admin who turns it into a call).
drop policy if exists cr_insert on public.call_requests;
create policy cr_insert on public.call_requests for insert
  with check (public.has_perm('request.create'));
drop policy if exists cr_update on public.call_requests;
create policy cr_update on public.call_requests for update
  using (public.has_perm('calls.create') or public.has_perm('pending.register') or created_by = auth.uid())
  with check (public.has_perm('calls.create') or public.has_perm('pending.register') or created_by = auth.uid());

-- reports: visible with the parent call; writing one is calls.report.
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select
  using (public.is_admin() or (public.has_perm('calls.view') and exists (
    select 1 from public.calls c where c.ucn = reports.ucn and public.can_see_call(c.allocated_to))));
drop policy if exists reports_write on public.reports;
create policy reports_write on public.reports for all
  using (public.has_perm('calls.report')) with check (public.has_perm('calls.report'));

-- consumption / feedback.
drop policy if exists cons_read on public.spare_consumption;
create policy cons_read on public.spare_consumption for select using (public.has_perm('consumption.view'));
drop policy if exists cons_write on public.spare_consumption;
create policy cons_write on public.spare_consumption for insert
  with check (public.has_perm('calls.report') or public.has_perm('spare.dispatch'));

drop policy if exists fb_read on public.feedback;
create policy fb_read on public.feedback for select
  using (public.has_perm('feedback.view') or public.has_perm('calls.report'));
drop policy if exists fb_write on public.feedback;
create policy fb_write on public.feedback for insert
  with check (public.has_perm('calls.report') or public.has_perm('feedback.view'));

-- spare requests: raising needs spare.request; reading follows the reporting
-- tree, plus anyone in the approval chain (they must see what they approve).
create or replace function public.can_approve_spares()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_perm('spare.approve_rm')
      or public.has_perm('spare.approve_commercial')
      or public.has_perm('spare.approve_nsm')
      or public.has_perm('spare.dispatch');
$$;
grant execute on function public.can_approve_spares() to authenticated;

drop policy if exists sr_read on public.spare_requests;
create policy sr_read on public.spare_requests for select
  using (public.is_admin() or created_by = auth.uid() or lower(engineer_email) = lower(auth.email())
    or public.can_approve_spares()
    or lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)));
drop policy if exists sr_insert on public.spare_requests;
create policy sr_insert on public.spare_requests for insert
  with check (public.has_perm('spare.request'));
drop policy if exists sr_update on public.spare_requests;
create policy sr_update on public.spare_requests for update
  using (public.can_approve_spares() or created_by = auth.uid())
  with check (public.can_approve_spares() or created_by = auth.uid());

-- Request lines: readable with their request; the requester writes their own
-- lines (the app inserts them right after the request), approvers may update.
drop policy if exists srl_read on public.spare_request_lines;
create policy srl_read on public.spare_request_lines for select
  using (exists (select 1 from public.spare_requests r where r.uid = spare_request_lines.request_uid));
drop policy if exists srl_write on public.spare_request_lines;
drop policy if exists srl_insert on public.spare_request_lines;
create policy srl_insert on public.spare_request_lines for insert
  with check (public.has_perm('spare.request') and exists (
    select 1 from public.spare_requests r where r.uid = request_uid
      and (r.created_by = auth.uid() or public.is_admin())));
drop policy if exists srl_update on public.spare_request_lines;
create policy srl_update on public.spare_request_lines for update
  using (public.can_approve_spares()) with check (public.can_approve_spares());

-- ---------------------------------------------------------------------------
-- Approval-stage guard. RLS grants or denies a whole row, so it cannot say
-- "you may set rm_approval but not nsm_approval". This trigger does: each
-- stage's columns may only change if the user holds that stage's action.
-- ---------------------------------------------------------------------------
create or replace function public.spare_requests_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed boolean;
begin
  if public.is_admin() then return new; end if;

  changed := new.rm_approval is distinct from old.rm_approval
          or new.rm_by       is distinct from old.rm_by
          or new.rm_at       is distinct from old.rm_at;
  if changed and not public.has_perm('spare.approve_rm') then
    raise exception 'RBAC: RM approval requires the spare.approve_rm permission';
  end if;

  changed := new.commercial_approval is distinct from old.commercial_approval
          or new.commercial_by       is distinct from old.commercial_by
          or new.commercial_at       is distinct from old.commercial_at;
  if changed and not public.has_perm('spare.approve_commercial') then
    raise exception 'RBAC: Commercial approval requires the spare.approve_commercial permission';
  end if;

  changed := new.nsm_approval is distinct from old.nsm_approval
          or new.nsm_by       is distinct from old.nsm_by
          or new.nsm_at       is distinct from old.nsm_at;
  if changed and not public.has_perm('spare.approve_nsm') then
    raise exception 'RBAC: NSM approval requires the spare.approve_nsm permission';
  end if;

  changed := new.stores_status  is distinct from old.stores_status
          or new.dc_number      is distinct from old.dc_number
          or new.dispatched_by  is distinct from old.dispatched_by
          or new.dispatched_at  is distinct from old.dispatched_at;
  if changed and not public.has_perm('spare.dispatch') then
    raise exception 'RBAC: dispatch / DC requires the spare.dispatch permission';
  end if;

  -- The workflow stage itself only moves as a side effect of an approval.
  if new.stage is distinct from old.stage and not public.can_approve_spares() then
    raise exception 'RBAC: advancing the approval stage requires an approval permission';
  end if;

  return new;
end $$;

drop trigger if exists spare_requests_stage_guard on public.spare_requests;
create trigger spare_requests_stage_guard
  before update on public.spare_requests
  for each row execute function public.spare_requests_stage_guard();

-- ---------------------------------------------------------------------------
-- Nobody edits their own role or extra permissions (privilege escalation) —
-- only users.manage may, and never to grant admin unless already an admin.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_role_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.extra_permissions is distinct from old.extra_permissions then
    if new.id = auth.uid() and not public.is_super_admin() then
      raise exception 'RBAC: you cannot change your own role or permissions';
    end if;
  end if;
  if new.role is distinct from old.role
     and lower(new.role) = 'admin' and not public.is_admin() then
    raise exception 'RBAC: granting admin requires an administrator';
  end if;
  return new;
end $$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.profiles_role_guard();
