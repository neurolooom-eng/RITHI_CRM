-- ===========================================================================
-- 0461 -- SECURITY SCAN FIXES (2026-10-27; the user: "Do a Security Scan -
-- Both Penetration Testing and Vulnerabilities Scan").
--
-- 1. AN ANONYMOUS CALLER HOLDS NO PERMISSION. Found by the penetration test
--    (docs/SECURITY_SCAN.md, F-01): has_perm() fell back to the Engineer set
--    when nobody was signed in, so a request carrying only the public key --
--    which is in the website for anybody to read -- could read feedback and
--    the quality objectives and insert call requests, spare requests,
--    feedback, consumption lines and pending registrations. 0300 had closed
--    the signed-in-without-a-profile case; the not-signed-in case was missed.
--    Restated from 0300 with one rule added first; nothing else changes.
--
-- 2. THE SIGNATURE NOTIFICATION'S LINK (0459) was written '#/profile?...',
--    and the bell hands a link to the router, which wants the route itself
--    ('/new-employee-requests' is how every other notification writes it).
--    Restated with '/profile?tab=signature', and any already sent repaired.
-- ===========================================================================

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
  select case
    -- NOBODY SIGNED IN HOLDS NOTHING (0461, security scan 2026-10-27). With no
    -- session auth.uid() is NULL, my_role() finds no profile, and the CTEs
    -- above fall back to the ENGINEER set -- so the public key alone, which
    -- ships in the website, carried an engineer's rights on every policy
    -- written has_perm(): it read feedback and the quality objectives and
    -- inserted call requests, spare requests and feedback. 'anon' is the role
    -- Supabase gives a request with no login; a migration or maintenance
    -- connection has no such claim and is unaffected.
    when auth.uid() is null and coalesce(auth.role(), '') = 'anon' then false
    when auth.uid() is not null
     and not exists (select 1 from public.profiles p where p.id = auth.uid())
      then coalesce(public.is_super_admin(), false)
    else public.is_admin()
      or exists (select 1 from perms p, keys where p.permissions ? keys.k)
      or (select bool_or(public.my_extra_perms() ? keys.k) from keys)
  end;
$$;

create or replace function public.set_user_signature(p_user uuid, p_signature text)
returns void language plpgsql security definer set search_path = public as $$
declare who text; whose_name text; whose_title text; whose_email text;
begin
  if auth.uid() is null or not coalesce(public.has_perm('users.signature.upload'), false) then
    raise exception 'Uploading somebody''s signature is for administrators ("Upload a person''s signature" on Roles & Permissions).' using errcode = '42501';
  end if;
  if coalesce(public.audit_mode(), false) then
    raise exception 'A signature cannot be uploaded for somebody while Audit Mode is on.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Use My Profile -> Signature for your own.';
  end if;
  if coalesce(p_signature, '') !~ '^data:image/(png|jpeg|jpg|webp);base64,' then
    raise exception 'The signature must be a PNG, JPEG or WebP image.';
  end if;
  if length(p_signature) > 1500000 then
    raise exception 'The signature image is too large -- under about 1 MB, please.';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), p.email), coalesce(p.designation, ''), p.email
    into whose_name, whose_title, whose_email from public.profiles p where p.id = p_user;
  if whose_email is null then raise exception 'No login for that person -- they must sign in once first.'; end if;
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into who from public.profiles p where p.id = auth.uid();

  perform set_config('rithi.signature_upload', 'on', true);
  insert into public.user_signatures as s (user_id, signature, name_line, title_line, set_by, set_by_name)
  values (p_user, p_signature, coalesce(whose_name, ''), coalesce(whose_title, ''), auth.uid(), coalesce(who, ''))
  on conflict (user_id) do update set signature = excluded.signature, set_by = excluded.set_by, set_by_name = excluded.set_by_name,
    name_line = case when btrim(s.name_line) = '' then excluded.name_line else s.name_line end,
    title_line = case when btrim(s.title_line) = '' then excluded.title_line else s.title_line end;
  perform set_config('rithi.signature_upload', '', true);

  insert into public.audit_log (user_id, email, actor, action, target, status, meta)
  values (auth.uid(), coalesce((select email from public.profiles where id = auth.uid()), ''), coalesce(who, ''),
          'signature.upload', coalesce(whose_name, p_user::text), 'ok', jsonb_build_object('user_id', p_user));
  insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
  values (p_user, coalesce(whose_email, ''), 'signature', 'Your signature was added by ' || coalesce(who, 'an administrator'),
          'An administrator uploaded your signature to RITHI. It goes on a form only when you press Sign. If it is not yours, or you want another, replace it on My Profile -> Signature.',
          '/profile?tab=signature');
end $$;
revoke execute on function public.set_user_signature(uuid, text) from public, anon;
grant execute on function public.set_user_signature(uuid, text) to authenticated;

-- Guarded: on a fresh rebuild this module runs before notifications exists.
do $$ begin
  if to_regclass('public.notifications') is not null then
    update public.notifications set link = '/profile?tab=signature'
     where kind = 'signature' and link = '#/profile?tab=signature';
  end if;
end $$;
