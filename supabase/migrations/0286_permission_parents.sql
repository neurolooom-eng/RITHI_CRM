-- ===========================================================================
-- 0286 — A PERMISSION CAN HAVE A PARENT; RBAC-OWNED RULES MOVE TO THE NEW KEYS
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0298) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0286, public.perm_parents).
--
-- This file: public.perm_parents and has_perm(); call_perm(), which picks the
-- register a UCN is on; visit reports, feedback, user administration, shared
-- charts and table layouts, and master records -- the rules rbac owns.
-- ===========================================================================

-- ---- 1. A key's PARENTS: holding the parent satisfies the child ----------
-- The client has the same list (PERM_PARENTS in src/lib/rbac.ts); check:ui
-- compares the two word for word. Rewritten whole on every run, so the table
-- is always exactly this list.
create table if not exists public.perm_parents (
  child  text not null,
  parent text not null,
  primary key (child, parent)
);
alter table public.perm_parents enable row level security;
revoke all on public.perm_parents from anon, authenticated;
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.perm_parents'::regclass);
  end if;
end $$;

delete from public.perm_parents;
insert into public.perm_parents (child, parent) values
  ('calls.edit.complaint', 'calls.edit'),
  ('calls.edit.customer', 'calls.edit'),
  ('calls.edit.vigilance', 'calls.edit'),
  ('calls.edit.contact', 'calls.edit'),
  ('install.edit.complaint', 'install.edit'),
  ('install.edit.customer', 'install.edit'),
  ('install.edit.vigilance', 'install.edit'),
  ('install.edit.contact', 'install.edit'),
  ('pm.edit.complaint', 'pm.edit'),
  ('pm.edit.customer', 'pm.edit'),
  ('pm.edit.vigilance', 'pm.edit'),
  ('pm.edit.contact', 'pm.edit'),
  ('calls.report.visit', 'calls.report'),
  ('install.report.visit', 'install.report'),
  ('pm.report.visit', 'pm.report'),
  ('visit.spares', 'calls.report'),
  ('visit.spares', 'install.report'),
  ('visit.spares', 'pm.report'),
  ('visit.feedback', 'calls.report'),
  ('visit.feedback', 'install.report'),
  ('visit.feedback', 'pm.report'),
  ('cover.edit.entries', 'cover.edit'),
  ('cover.edit.delete', 'cover.edit'),
  ('contract.edit.entries', 'contract.edit'),
  ('contract.edit.delete', 'contract.edit'),
  ('masters.edit.records', 'masters.edit'),
  ('masters.edit.kyc', 'masters.edit'),
  ('masters.edit.rename_part', 'masters.edit'),
  ('masters.edit.swap_serviceman', 'masters.edit'),
  ('users.manage.details', 'users.manage'),
  ('users.manage.create', 'users.manage'),
  ('users.manage.disable', 'users.manage'),
  ('users.manage.access', 'users.manage'),
  ('users.manage.settings', 'users.manage'),
  -- One key to add, one to edit, one to delete per master (0325, 2026-10-03).
  -- 0325 inserts the same rows for a database that ran this file before them.
  ('masters.parties.add', 'masters.edit.records'),
  ('masters.parties.add', 'masters.edit'),
  ('masters.parties.edit', 'masters.edit.records'),
  ('masters.parties.edit', 'masters.edit'),
  ('masters.parties.delete', 'masters.edit'),
  ('masters.parts.add', 'masters.edit.records'),
  ('masters.parts.add', 'masters.edit'),
  ('masters.parts.edit', 'masters.edit.records'),
  ('masters.parts.edit', 'masters.edit'),
  ('masters.parts.delete', 'masters.edit'),
  ('masters.product_master.add', 'masters.edit.records'),
  ('masters.product_master.add', 'masters.edit'),
  ('masters.product_master.edit', 'masters.edit.records'),
  ('masters.product_master.edit', 'masters.edit'),
  ('masters.product_master.delete', 'masters.edit'),
  -- D-129 (0401, 2026-10-05): an editor of the review reads its answers.
  ('review.view', 'review.edit');

-- has_perm() keeps its shape and its NULL: with no signed-in user
-- my_extra_perms() is NULL, and several callers rely on `if not has_perm()`
-- then being skipped for an import or a scheduled run, as it always was.
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
  ),
  keys as (
    select action as k
    union all
    select pp.parent from public.perm_parents pp where pp.child = action
  )
  select public.is_admin()
      or exists (select 1 from perms p, keys where p.permissions ? keys.k)
      or (select bool_or(public.my_extra_perms() ? keys.k) from keys);
$$;
grant execute on function public.has_perm(text) to authenticated;

-- ---- 2. Which register a call is on decides which key governs it ---------
-- plpgsql so its body is not resolved at creation: this module runs before
-- the call tables exist on a fresh apply.
create or replace function public.call_perm(p_ucn text, p_verb text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_reg text := 'calls';
begin
  if exists (select 1 from public.installation_calls where ucn = p_ucn) then v_reg := 'install';
  elsif exists (select 1 from public.pm_calls where ucn = p_ucn) then v_reg := 'pm';
  end if;
  return public.has_perm(v_reg || '.' || p_verb);
end $$;
revoke execute on function public.call_perm(text, text) from public, anon;
grant  execute on function public.call_perm(text, text) to authenticated;

-- ---- 3. Visit reports: the call's own register's "save a visit" ----------
-- Split out of FOR ALL, which is also a read policy and would have run
-- call_perm() once per row on every read of the visit history.
drop policy if exists reports_write  on public.reports;
drop policy if exists reports_insert on public.reports;
drop policy if exists reports_update on public.reports;
drop policy if exists reports_delete on public.reports;
create policy reports_insert on public.reports for insert
  with check (public.call_perm(ucn, 'report.visit'));
create policy reports_update on public.reports for update
  using (public.call_perm(ucn, 'report.visit')) with check (public.call_perm(ucn, 'report.visit'));
create policy reports_delete on public.reports for delete
  using (public.call_perm(ucn, 'report.visit'));

-- ---- 4. Customer feedback taken on a visit -------------------------------
drop policy if exists fb_read  on public.feedback;
drop policy if exists fb_write on public.feedback;
create policy fb_read on public.feedback for select
  using (public.has_perm('feedback.view') or public.has_perm('visit.feedback'));
create policy fb_write on public.feedback for insert
  with check (public.has_perm('visit.feedback') or public.has_perm('feedback.view'));

-- ---- 5. User administration, split five ways ------------------------------
drop policy if exists profiles_admin_write  on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;
drop policy if exists profiles_self_read    on public.profiles;
create policy profiles_admin_insert on public.profiles for insert
  with check ((select public.has_perm('users.manage.create')));
create policy profiles_admin_update on public.profiles for update
  using ((select public.has_perm('users.manage.details') or public.has_perm('users.manage.access') or public.has_perm('users.manage.disable') or public.has_perm('users.manage.create'))) with check ((select public.has_perm('users.manage.details') or public.has_perm('users.manage.access') or public.has_perm('users.manage.disable') or public.has_perm('users.manage.create')));
create policy profiles_admin_delete on public.profiles for delete
  using ((select public.has_perm('users.manage.disable')));
create policy profiles_self_read on public.profiles for select
  using (id = auth.uid() or public.is_admin() or (select public.has_perm('users.manage.details') or public.has_perm('users.manage.access') or public.has_perm('users.manage.disable') or public.has_perm('users.manage.create')));

drop policy if exists ud_write  on public.user_directory;
drop policy if exists ud_insert on public.user_directory;
drop policy if exists ud_update on public.user_directory;
drop policy if exists ud_delete on public.user_directory;
create policy ud_insert on public.user_directory for insert
  with check ((select public.has_perm('users.manage.details') or public.has_perm('users.manage.create')));
create policy ud_update on public.user_directory for update
  using ((select public.has_perm('users.manage.details'))) with check ((select public.has_perm('users.manage.details')));
create policy ud_delete on public.user_directory for delete
  using ((select public.has_perm('users.manage.disable')));

-- ---- 6. Shared charts and table layouts get keys of their own ------------
drop policy if exists sc_write_shared on public.saved_charts;
create policy sc_write_shared on public.saved_charts for all
  using (role is not null and (public.is_admin() or public.has_perm('charts.share')))
  with check (role is not null and (public.is_admin() or public.has_perm('charts.share')));

drop policy if exists rtv_write on public.role_table_views;
create policy rtv_write on public.role_table_views for all
  using (public.is_admin() or public.has_perm('layouts.share'))
  with check (public.is_admin() or public.has_perm('layouts.share'));

-- ---- 7. Master records: the general child of masters.edit ----------------
do $$
declare t text;
begin
  foreach t in array array['parties', 'parts', 'products'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %1$s_write on public.%1$s', t);
      execute format('create policy %1$s_write on public.%1$s for all '
                     'using ((select public.has_perm(''masters.edit.records''))) '
                     'with check ((select public.has_perm(''masters.edit.records'')))', t);
    end if;
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.profiles_role_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- Only a caller through the API is gated: the SQL editor, an import and a
  -- scheduled job are not a person holding keys (the `role` setting survives
  -- SECURITY DEFINER, current_user does not), and an administrator is
  -- everybody.
  api  boolean := coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon');
  self boolean := new.id = auth.uid();
begin
  if tg_op = 'INSERT' then
    -- A PERSON'S OWN FIRST SIGN-IN (0033) creates their profile with the role
    -- their User Master row carries -- a role somebody holding "Assign roles"
    -- put there (ud_role_guard below). Anybody else creating a login decides
    -- what it may do only if they may assign roles: "Create logins" alone
    -- makes an Engineer with nothing extra (finding 67).
    if api and not self and not public.is_admin()
       and (coalesce(nullif(btrim(new.role), ''), 'engineer') <> 'engineer'
            or jsonb_array_length(coalesce(new.extra_permissions, '[]'::jsonb)) > 0)
       and not coalesce(public.has_perm('users.manage.access'), false) then
      raise exception 'RBAC: creating a login with a role other than Engineer, or with extra permissions, needs "Assign roles & grant permissions"';
    end if;
    if not self and lower(coalesce(new.role, '')) = 'admin' and api and not public.is_admin() then
      raise exception 'RBAC: granting admin requires an administrator';
    end if;
    return new;
  end if;

  -- WHICH KEY MAY MOVE WHICH COLUMN (0286): the role and extra permissions are
  -- "Assign roles & grant permissions"; switching a login on or off is
  -- "Disable or delete logins".
  if api and not public.is_admin() then
    if (new.role is distinct from old.role or new.extra_permissions is distinct from old.extra_permissions)
       and not coalesce(public.has_perm('users.manage.access'), false) then
      raise exception 'RBAC: changing a role or permissions needs "Assign roles & grant permissions"';
    end if;
    if new.active is distinct from old.active
       and not coalesce(public.has_perm('users.manage.disable'), false) then
      raise exception 'RBAC: switching a login on or off needs "Disable or delete logins"';
    end if;
  end if;
  if new.role is distinct from old.role or new.extra_permissions is distinct from old.extra_permissions then
    if self and not public.is_super_admin() then
      raise exception 'RBAC: you cannot change your own role or permissions';
    end if;
  end if;
  if new.role is distinct from old.role
     and lower(new.role) = 'admin' and not public.is_admin() then
    raise exception 'RBAC: granting admin requires an administrator';
  end if;
  return new;
end $function$;

-- ...and it now fires on INSERT as well: a login created with a role was not
-- checked at all, so "Manage users" could create an Admin outright.
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before insert or update on public.profiles
  for each row execute function public.profiles_role_guard();

-- THE ROLE A USER MASTER ROW GRANTS AT FIRST SIGN-IN (0033) is assigning a
-- role, so it asks the same key -- or "Edit User Master details" alone could
-- give a new joiner any role before they ever signed in.
create or replace function public.user_directory_role_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and not public.is_admin()
     and ((tg_op = 'INSERT' and coalesce(btrim(new.role), '') <> '')
          or (tg_op = 'UPDATE' and new.role is distinct from old.role))
     and not coalesce(public.has_perm('users.manage.access'), false) then
    raise exception 'RBAC: setting the role a person signs in with needs "Assign roles & grant permissions"';
  end if;
  return new;
end $$;
revoke execute on function public.user_directory_role_guard() from public, anon, authenticated;
do $$
begin
  if to_regclass('public.user_directory') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'user_directory' and column_name = 'role') then
    drop trigger if exists ud_role_guard on public.user_directory;
    create trigger ud_role_guard before insert or update on public.user_directory
      for each row execute function public.user_directory_role_guard();
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.user_signature_status()
 RETURNS TABLE(user_id uuid, full_name text, email text, has_signature boolean, signed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_admin() or public.has_perm('users.manage.details')) then
    raise exception 'Only User Access may see who has saved a signature.';
  end if;
  return query
    select p.id, p.full_name, p.email,
           (s.user_id is not null and coalesce(btrim(s.signature), '') <> ''),
           s.updated_at
      from public.profiles p
      left join public.user_signatures s on s.user_id = p.id
     order by p.full_name;
end $function$;

CREATE OR REPLACE FUNCTION public.set_role_table_view(p_storage_key text, p_role text, p_view jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_at bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not (public.is_admin() or public.has_perm('layouts.share')) then
    raise exception 'RBAC: only an administrator can set a layout for a role';
  end if;
  if coalesce(btrim(p_storage_key), '') = '' then
    raise exception 'Which register?';
  end if;

  insert into public.role_table_views (storage_key, role, view, set_at, updated_at, updated_by)
  values (btrim(p_storage_key), coalesce(btrim(p_role), ''), coalesce(p_view, '{}'::jsonb), v_at, now(), auth.uid())
  on conflict (storage_key, role) do update
     set view = excluded.view, set_at = excluded.set_at,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  return v_at;
end $function$;

CREATE OR REPLACE FUNCTION public.clear_role_table_view(p_storage_key text, p_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_admin() or public.has_perm('layouts.share')) then
    raise exception 'RBAC: only an administrator can clear a layout for a role';
  end if;
  delete from public.role_table_views
   where storage_key = btrim(p_storage_key) and role = coalesce(btrim(p_role), '');
  return found;
end $function$;
