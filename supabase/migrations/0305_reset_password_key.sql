-- ===========================================================================
-- RESETTING A PASSWORD IS users.reset_password -- AND NOT A CHILD OF users.manage.
-- WHAT WAS AN ADMINISTRATOR'S ALONE IS A KEY (the user, 2026-09-30: "All
-- Admin Actions that are greyed out now should be editable from the Role &
-- Permissions. Only the Admin Role should be Greyed out not the Actions.")
--
-- is_admin() becomes has_perm(<key>). An administrator still passes -- has_perm()
-- answers true for is_admin() -- so nobody loses anything, and NOBODY ELSE GAINS
-- ANYTHING ON THE DAY: no role holds the new key until an administrator ticks it
-- on Roles & Permissions. coalesce(..., false) so a NULL (no session) refuses.
--
-- Not a child of users.manage on purpose: a reset lets its holder sign in as
-- the person, so ticking Manage users must never hand it over. And a holder
-- who is not an administrator is refused an Admin's password, and the password
-- of anyone who can grant permissions (see the function) -- otherwise the key
-- would be a route to every other key. A super admin's still needs a super
-- admin. The reset log is readable by the same holders.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_password(p_email text, p_password text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth'
AS $function$
declare v_id uuid; v_email text; v_target_super boolean; v_target_keys jsonb; v_target_role text;
begin
  if not coalesce(public.has_perm('users.reset_password'), false) then
    raise exception 'RBAC: resetting a password needs "Reset a person''s password"';
  end if;
  -- The generator makes 14; this floor is here so the function cannot be used
  -- to set something weak by hand.
  if length(coalesce(p_password, '')) < 10 then
    raise exception 'A reset password must be at least 10 characters';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is null then raise exception 'No login for %', p_email; end if;

  select exists (select 1 from public.app_super_admins s where lower(s.email) = v_email)
    into v_target_super;
  if v_target_super and not public.is_super_admin() then
    raise exception 'Only a super admin can reset a super admin''s password';
  end if;

  -- A RESET IS A WAY TO SIGN IN AS SOMEBODY, so a holder who is not an
  -- administrator may not reset the password of anyone who could hand them
  -- more than they hold: an Admin, or anyone whose role or own grants carry
  -- rbac.manage, users.manage / users.manage.access, or this key itself.
  if not coalesce(public.is_admin(), false) then
    select lower(coalesce(nullif(btrim(p.role), ''), 'engineer')),
           coalesce(r.permissions, '[]'::jsonb) || coalesce(p.extra_permissions, '[]'::jsonb)
      into v_target_role, v_target_keys
      from public.profiles p
      left join public.app_roles r on r.role = lower(coalesce(nullif(btrim(p.role), ''), 'engineer'))
     where p.id = v_id;
    if v_target_role = 'admin'
       or coalesce(v_target_keys, '[]'::jsonb) ?| array['rbac.manage', 'users.manage', 'users.manage.access', 'users.reset_password'] then
      raise exception 'Only an administrator can reset the password of an administrator or of somebody who can grant permissions';
    end if;
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at         = now()
   where id = v_id;

  -- End what they had open, so the reset takes effect on every device rather
  -- than leaving an old session signed in. Both tables are Supabase's own and
  -- absent from a bare Postgres, so neither is allowed to fail the reset.
  begin
    delete from auth.sessions where user_id = v_id;
  exception when others then null;
  end;
  begin
    delete from auth.refresh_tokens where user_id::text = v_id::text;
  exception when others then null;
  end;

  insert into public.password_resets (target_email, target_id, reset_by, reset_by_email)
  values (v_email, v_id, auth.uid(), coalesce(auth.email(), ''));

  return v_email;
end $function$;

drop policy if exists pwr_read on public.password_resets;
create policy pwr_read on public.password_resets for select
  using ((select public.is_admin()) or (select public.has_perm('users.reset_password')));
