-- ===========================================================================
-- 0459 -- AN ADMINISTRATOR MAY UPLOAD A PERSON'S SIGNATURE (the user,
-- 2026-10-27, as Admin: "I have a few user's signature, How to add it?";
-- asked: "Admin uploads for them" -- Non-Auditable, hidden in Audit Mode,
-- recorded in the audit log, and the person told so they can replace it).
-- NAR-012.
--
-- WHAT CHANGES IN 0172's RULE ("write your own, and nobody else's"): ONE
-- checked path, set_user_signature(), lets a holder of users.signature.upload
-- -- a key no migration grants and no child of users.manage, so
-- administrators only -- save the image for another login. The table policies
-- are untouched; nobody can write another person's row through the API.
--
-- WHAT DOES NOT CHANGE: nothing places a signature but its owner's own act.
-- sign_training_request() (0454) reads only the caller's signature, and a
-- printed document prints one only in the block naming the person printing.
-- An uploaded signature is used when THAT PERSON presses Sign.
--
-- The row says who uploaded it (set_by, set_by_name) until the person saves
-- their own, which clears both; My Profile -> Signature shows it. The person
-- gets a notification. Every upload is written to audit_log
-- (signature.upload). Refused while Audit Mode is on.
-- ===========================================================================

alter table public.user_signatures add column if not exists set_by      uuid;
alter table public.user_signatures add column if not exists set_by_name text not null default '';

-- ---- the stamp, restated from 0172 -----------------------------------------
-- The owner is still the session's -- except on the one administrative path,
-- which says so with a transaction-local setting only set_user_signature()
-- sets. A row the owner writes themselves is theirs: set_by is cleared.
create or replace function public.user_signature_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('rithi.signature_upload', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;
  -- The owner is the session's, not the caller's to name. The insert policy
  -- already refuses another user's id; this makes the column unable to CARRY
  -- one, so the two cannot disagree.
  new.user_id := coalesce(auth.uid(), new.user_id);
  new.set_by := null;
  new.set_by_name := '';
  new.updated_at := now();
  return new;
end $$;

-- ---- the administrative path -----------------------------------------------
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
          '#/profile?tab=signature');
end $$;
revoke execute on function public.set_user_signature(uuid, text) from public, anon;
grant execute on function public.set_user_signature(uuid, text) to authenticated;
