-- ===========================================================================
-- 0456 -- SEEING A PERSON'S SIGNATURE IS FOR ADMINISTRATORS, AND HIDDEN IN
-- AUDIT MODE (the user, 2026-10-27: "I want admins to be able to see the
-- signature. It's a Non Auditable requirement"; asked: "Administrators only",
-- and "Hide in Audit Mode"). NAR-011.
--
-- 0455 let whoever may edit User Master details see it. Now it is its own key,
-- users.signature.view, which NO MIGRATION GRANTS: an administrator passes
-- has_perm() whatever it names, so on the day this is administrators only, as
-- asked -- and it is a key rather than a bare is_admin() because the project
-- has no admin-only actions (0302-0307). It is deliberately NOT a child of
-- users.manage, so ticking Manage users never hands it over.
--
-- While Audit Mode is on the database refuses it, whoever asks: the screen
-- hides the button, and this is what makes the hiding true for a caller that
-- goes round the screen. Every look is still written to the audit log.
-- The Saved / Not yet column and the tracker are unchanged -- they belong to
-- the training-signature requirement (FRS-281), which stays auditable.
-- ===========================================================================

create or replace function public.user_signature_of(p_user uuid)
returns table (signature text, name_line text, title_line text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare who text; whose text;
begin
  if auth.uid() is null or not coalesce(public.has_perm('users.signature.view'), false) then
    raise exception 'Seeing a signature is for administrators ("See a person''s signature" on Roles & Permissions).' using errcode = '42501';
  end if;
  if coalesce(public.audit_mode(), false) then
    raise exception 'A signature cannot be shown while Audit Mode is on.' using errcode = '42501';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into who from public.profiles p where p.id = auth.uid();
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into whose from public.profiles p where p.id = p_user;
  insert into public.audit_log (user_id, email, actor, action, target, status, meta)
  values (auth.uid(), coalesce((select email from public.profiles where id = auth.uid()), ''), coalesce(who, ''),
          'signature.view', coalesce(whose, p_user::text), 'ok', jsonb_build_object('user_id', p_user));
  return query
    select s.signature, s.name_line, s.title_line, s.updated_at
      from public.user_signatures s
     where s.user_id = p_user and coalesce(btrim(s.signature), '') <> '';
end $$;
revoke execute on function public.user_signature_of(uuid) from public, anon;
grant execute on function public.user_signature_of(uuid) to authenticated;
