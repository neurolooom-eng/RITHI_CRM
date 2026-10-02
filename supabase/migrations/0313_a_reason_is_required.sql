-- ===========================================================================
-- A REASON THE REQUIREMENT DEMANDS CANNOT BE LEFT BLANK (D-043, URS-120,
-- URS-035, FRS-148).
--
-- Three paths let one through:
--   1. a single-line or per-order REJECTION is a direct UPDATE of
--      spare_request_lines, and the line guard (0217) checks the permission,
--      not the reason -- only the bulk path, decide_spare_lines() (0118),
--      demanded one;
--   2. Pending Dispatch's DROP sends whatever window.prompt() returned, and OK
--      on an empty box is an empty string -- a drop with no reason;
--   3. reassign_spare_request() defaulted p_reason to '' and the screen's Why
--      box was optional, while URS-035 keeps every change WITH its reason.
--
-- THE RULE: a line moving INTO Rejected at any stage needs `reject_reason`; a
-- line moving INTO Dropped needs `dispatch_remarks` (where the drop's reason
-- is written, by decide_spare_lines() and the screen alike); a reassignment
-- needs p_reason. Only a CHANGE is tested, so a re-load that leaves a
-- historical rejection as it was is untouched, and an insert (an imported
-- request) is not an update. With no signed-in session (a migration, an
-- administrative load) nothing is refused: there is nobody to ask.
--
-- A trigger of its own rather than a line in spare_request_lines_guard():
-- that function was rewritten from an old copy once and lost three rules
-- (0210, repaired by 0217), and again by 0310. Adding to it means re-typing it.
--
-- reassign_spare_request() below is 0304's definition read out of a database
-- built from every migration, with one check added after the engineer's.
-- ===========================================================================

create or replace function public.spare_line_needs_a_reason()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (   (coalesce(new.rm_approval, '')         = 'Rejected' and coalesce(old.rm_approval, '')         <> 'Rejected')
      or (coalesce(new.commercial_approval, '') = 'Rejected' and coalesce(old.commercial_approval, '') <> 'Rejected')
      or (coalesce(new.nsm_approval, '')        = 'Rejected' and coalesce(old.nsm_approval, '')        <> 'Rejected'))
     and btrim(coalesce(new.reject_reason, '')) = '' then
    raise exception 'A rejection needs a reason';
  end if;
  if coalesce(new.stores_status, '') = 'Dropped' and coalesce(old.stores_status, '') <> 'Dropped'
     and btrim(coalesce(new.dispatch_remarks, '')) = '' then
    raise exception 'A drop needs a reason';
  end if;
  return new;
end $$;
revoke execute on function public.spare_line_needs_a_reason() from public, anon, authenticated;

drop trigger if exists spare_line_needs_a_reason on public.spare_request_lines;
create trigger spare_line_needs_a_reason
  before update on public.spare_request_lines
  for each row execute function public.spare_line_needs_a_reason();

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
  -- THE REASON IS REQUIRED (D-043, URS-035): every change is kept WITH its
  -- reason. It defaulted to '' and the screen's Why box was optional.
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Say why the order is moving to another engineer — the reason is kept with the record';
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
