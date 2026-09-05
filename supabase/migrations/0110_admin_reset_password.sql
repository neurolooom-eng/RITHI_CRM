-- ===========================================================================
-- AN ADMINISTRATOR CAN RESET A FORGOTTEN PASSWORD.
--
-- The sign-in page now says "ask an administrator" (v0.9.89), and until this
-- there was nothing for the administrator to do — they had to go to the
-- Supabase dashboard. This gives them the action in the app: a random password
-- is generated, set on the account, and shown ONCE so it can be passed to the
-- person, who changes it under Profile → Password whenever they like.
--
-- WHY IT WRITES `auth.users` DIRECTLY, AND WHAT THAT COSTS.
-- Setting somebody ELSE'S password is an admin-API operation, and the admin API
-- needs the service_role key — which must never be in a browser, so the app
-- cannot call it. The two honest options were an Edge Function holding that key
-- or a definer function here. This project delivers everything as a migration
-- the user runs, and an admin action that fails until an Edge Function is
-- deployed is an admin action that does not work. So: here, as SECURITY
-- DEFINER, writing the same bcrypt hash Supabase's own reset writes.
--
-- It is off the supported path, and these are the limits:
--   • it does not run Supabase's own password policy — the length floor below
--     is the only rule, and the generator makes far longer ones;
--   • it does not send anything. The administrator passes the password on;
--   • if Supabase ever changes how it stores passwords this stops working, and
--     it stops LOUDLY (the person cannot sign in), not silently.
--
-- WHAT IT REFUSES:
--   • anyone who is not an administrator;
--   • a super admin's account, unless the caller is a super admin. An admin who
--     could reset a super admin's password could take the project;
--   • a password under 10 characters, so this cannot be used to set a weak one.
--
-- THE PASSWORD IS NEVER STORED. `password_resets` records WHO reset WHOSE
-- account and when — the fact of it, which is what an audit needs — and nothing
-- that could be used to sign in.
--
-- Every session the person had is ended, so a reset actually takes effect
-- everywhere rather than leaving an old phone signed in.
-- ===========================================================================

create extension if not exists pgcrypto;

create table if not exists public.password_resets (
  id             bigint generated always as identity primary key,
  target_email   text not null,
  target_id      uuid,
  reset_by       uuid,
  reset_by_email text not null default '',
  reset_at       timestamptz not null default now()
);
create index if not exists password_resets_at_idx on public.password_resets (reset_at desc);

alter table public.password_resets enable row level security;
-- Readable by administrators, written only by the function below (which is
-- definer, so it is not subject to this).
drop policy if exists pwr_read on public.password_resets;
create policy pwr_read on public.password_resets for select using (public.is_admin());

create or replace function public.admin_reset_password(p_email text, p_password text)
returns text language plpgsql security definer
set search_path = public, extensions, auth as $$
declare v_id uuid; v_email text; v_target_super boolean;
begin
  if not public.is_admin() then
    raise exception 'RBAC: only an administrator can reset a password';
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
end $$;
revoke all on function public.admin_reset_password(text, text) from public;
grant execute on function public.admin_reset_password(text, text) to authenticated;
