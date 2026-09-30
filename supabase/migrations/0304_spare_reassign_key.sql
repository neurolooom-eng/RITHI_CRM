-- ===========================================================================
-- CHANGING THE ENGINEER ON A SPARE REQUEST IS spare.reassign.
-- WHAT WAS AN ADMINISTRATOR'S ALONE IS A KEY (the user, 2026-09-30: "All
-- Admin Actions that are greyed out now should be editable from the Role &
-- Permissions. Only the Admin Role should be Greyed out not the Actions.")
--
-- is_admin() becomes has_perm(<key>). An administrator still passes -- has_perm()
-- answers true for is_admin() -- so nobody loses anything, and NOBODY ELSE GAINS
-- ANYTHING ON THE DAY: no role holds the new key until an administrator ticks it
-- on Roles & Permissions. coalesce(..., false) so a NULL (no session) refuses.
--
-- The rest of the function is untouched: still refused once anything on the
-- order has been dispatched, and every change still lands in
-- spare_request_engineer_log -- which a holder of the key may now read.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.reassign_spare_request(p_uid text, p_engineer text, p_email text DEFAULT ''::text, p_reason text DEFAULT ''::text)
 RETURNS spare_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r      public.spare_requests;
  v_name text := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  v_to   text := btrim(coalesce(p_engineer, ''));
  v_mail text := lower(btrim(coalesce(p_email, '')));
begin
  if not coalesce(public.has_perm('spare.reassign'), false) then
    raise exception 'Changing the engineer on a spare request needs "Change the engineer on a spare request"';
  end if;
  if v_to = '' then
    raise exception 'Give the engineer the request is being moved to';
  end if;

  select * into r from public.spare_requests where uid = p_uid;
  if not found then
    raise exception 'No spare request %', p_uid;
  end if;
  if public.spare_request_is_dispatched(p_uid) then
    raise exception 'OR % has already been dispatched — the parts are in %''s hands, so the engineer cannot be changed. Use a stock transfer instead.',
      coalesce(nullif(r.or_no, ''), p_uid), coalesce(nullif(r.engineer, ''), 'the engineer');
  end if;
  if lower(btrim(coalesce(r.engineer, ''))) = lower(v_to)
     and (v_mail = '' or lower(coalesce(r.engineer_email, '')) = v_mail) then
    return r;                       -- already there; nothing to log
  end if;

  -- The address is looked up when it is not given, so the request keeps a
  -- working one: every engineer-scoped read matches on email, and a name with
  -- the wrong address beside it is a request its own engineer cannot see.
  if v_mail = '' then
    v_mail := lower(coalesce((select email from public.profiles
                               where lower(full_name) = lower(v_to)
                               order by id limit 1), ''));
  end if;

  -- Tell the guard trigger that this update is the one it is meant to allow.
  -- `true` scopes it to this transaction, so it cannot leak into the next.
  perform set_config('rithi.reassigning', p_uid, true);

  insert into public.spare_request_engineer_log
    (request_uid, or_no, from_engineer, from_email, to_engineer, to_email, reason, changed_by, changed_by_name)
  values (p_uid, coalesce(r.or_no, ''), coalesce(r.engineer, ''), coalesce(r.engineer_email, ''),
          v_to, v_mail, btrim(coalesce(p_reason, '')), auth.uid(), v_name);

  update public.spare_requests
     set engineer = v_to, engineer_email = v_mail
   where uid = p_uid
  returning * into r;

  perform set_config('rithi.reassigning', '', true);
  return r;
end $function$;

drop policy if exists srel_read on public.spare_request_engineer_log;
create policy srel_read on public.spare_request_engineer_log for select
  using ((select public.is_admin()) or (select public.has_perm('spare.reassign'))
         or (select public.has_perm('spare.dispatch')) or (select public.has_perm('spare.approve'))
         or lower(from_email) = lower((select auth.email())) or lower(to_email) = lower((select auth.email())));
