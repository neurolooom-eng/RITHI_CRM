-- ===========================================================================
-- 0455 -- THE SIGNATURE ON USER MASTER (the user, 2026-10-27: "Show signature
-- in User Master"; asked, and shown that it changes 0172's rule that nobody
-- reads anybody else's signature: "Both" -- a Saved / Not yet column for
-- everyone, and the image in the opened person's profile).
--
-- WHAT CHANGES AND WHAT DOES NOT.
--   * Whoever may edit User Master details (users.manage.details) may now SEE
--     one person's saved signature, one person at a time, through
--     user_signature_of(). 0172's table policies are untouched: nobody can
--     select another person's row from user_signatures directly, and nobody
--     can write one.
--   * SEEING IS NOT PLACING. sign_training_request() (0454) still reads only
--     the CALLER's own signature, and every printed document still prints a
--     signature only in the block that names its owner. An administrator who
--     can see a signature has no path to put it on anything.
--   * EVERY LOOK IS RECORDED. The function writes an audit_log row --
--     who looked, whose signature, when -- in the same transaction it returns
--     the image, so a look that is not logged does not happen. The client
--     cannot skip it the way it could skip a client-side log.
-- ===========================================================================

create or replace function public.user_signature_of(p_user uuid)
returns table (signature text, name_line text, title_line text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare who text; whose text;
begin
  if auth.uid() is null or not coalesce(public.has_perm('users.manage.details'), false) then
    raise exception 'Seeing a signature needs "Edit User Master details" on Roles & Permissions.' using errcode = '42501';
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
