-- ===========================================================================
-- A SPARE REQUEST ON A CALL WITH NO VISIT FILES THE VISIT IT IMPLIES.
--
-- The user, 2026-10-03: "If there is no visit entry, and a Spare request is
-- created - Add a visit entry with status Unsolved, the requesting engineer
-- name, requesting date and call pending reason as SPARE UNAVAILABLE or SPARE
-- NOT AVAILABLE whichever reason is available in the call pending list, update
-- visit report - No. If there is a visit entry done before spare request,
-- don't add this. This should happen [when] the spare request is saved."
--
-- WHAT IT FILES, one row in public.reports, written the way the Visit Entry
-- screen writes one (fileVisit, CallReporting.tsx):
--   call_status     'Unsolved'
--   pending_reason  the Call Pending Reason master entry meaning "spare not
--                   available" -- matched on its LETTERS, so SPARE / SPARES and
--                   NOT AVAILABLE / UNAVAILABLE all qualify (the seeded value is
--                   'SPARES NOT AVAILABLE', 0021). An active entry is preferred.
--                   If the master holds none, the seeded spelling is used.
--   engineer        the request's engineer (name and email)
--   visit_at        the request's date, in India, at UTC midnight -- the shape
--                   the screen writes a visit date in
--   data            'Update Visit Work Details?' = 'No', the visit's two dates,
--                   who filed it, the call type, and 'Spare Request' = the OR
--                   number, so the visit says where it came from
-- and stamps the call Unsolved, as the screen does after filing a visit.
--
-- WHEN IT DOES NOTHING: a HandStock request (no call), a UCN that is not a
-- call, or a call that ALREADY HAS ANY VISIT. A visit filed before the request
-- means the engineer has already said what happened; a visit filed by an
-- EARLIER spare request on the same call is also a visit, so a second request
-- adds nothing.
--
-- WHY A FUNCTION THE SCREEN CALLS, NOT A TRIGGER ON spare_requests:
--   1. the screen writes the header, then the lines, and when the lines fail
--      its clean-up DELETE is refused by the retention guard (0049, D-044), so
--      a trigger on the header would file a visit -- and turn the call
--      Unsolved -- for a request that never saved;
--   2. the Bulk Uploads importer inserts spare_requests too, and loading the
--      request HISTORY must not file thousands of visits dated in the past and
--      flip old calls back to Unsolved.
-- So addSpareRequest() calls this after the lines are in.
--
-- SECURITY DEFINER, because filing a visit needs `report.visit` on the call
-- (reports_insert, 0286) and a requester may hold `spare.request` alone. The
-- caller is checked instead: they must hold spare.request AND be the person who
-- raised this request (created_by, stamped from auth.uid() since 0009).
--
-- The uid is 'SPR-' || the request's uid: deterministic, so a retry cannot file
-- two, and outside the 'WEB-' prefix the visit-date guard checks (0115) -- the
-- date is the request's own, which is today, so nothing is being back-dated.
-- ===========================================================================

create or replace function public.file_visit_for_spare_request(p_uid text)
returns text language plpgsql security definer set search_path = public as $$
declare
  r        public.spare_requests%rowtype;
  v_call   record;
  v_reason text;
  v_day    date;
  v_uid    text;
  v_me     text;
begin
  if not public.has_perm('spare.request') then
    raise exception 'Your role does not have permission for this action'
      using errcode = '42501';
  end if;

  select * into r from public.spare_requests where uid = btrim(coalesce(p_uid, ''));
  if not found then
    raise exception 'Spare request % was not found', p_uid using errcode = 'P0002';
  end if;
  if r.created_by is distinct from auth.uid() then
    raise exception 'Only the person who raised spare request % can file its visit', coalesce(nullif(r.or_no, ''), r.uid)
      using errcode = '42501';
  end if;

  if coalesce(r.req_type, '') <> 'Call Based' or btrim(coalesce(r.ucn, '')) = '' then
    return 'skipped: not a call-based request';
  end if;

  select c.ucn, c.call_number, c.call_type into v_call
    from public.calls c where c.ucn = btrim(r.ucn) limit 1;
  if v_call.ucn is null then
    return 'skipped: no such call';
  end if;

  if exists (select 1 from public.reports x where x.ucn = v_call.ucn) then
    return 'skipped: the call already has a visit';
  end if;

  select m.value into v_reason
    from public.masters m
   where m.name = 'pendingreason'
     and regexp_replace(upper(m.value), '[^A-Z]', '', 'g')
         in ('SPAREUNAVAILABLE', 'SPARENOTAVAILABLE', 'SPARESUNAVAILABLE', 'SPARESNOTAVAILABLE')
   order by m.active desc, m.id
   limit 1;
  v_reason := coalesce(v_reason, 'SPARES NOT AVAILABLE');

  v_day := (r.created_at at time zone 'Asia/Kolkata')::date;
  v_uid := 'SPR-' || r.uid;
  v_me  := coalesce((select nullif(btrim(p.email), '') from public.profiles p where p.id = auth.uid()),
                    auth.email(), r.engineer_email, '');

  insert into public.reports (uid, ucn, call_number, call_status, pending_reason,
                              engineer, engineer_email, visit_at, data, updated_at)
  values (v_uid, v_call.ucn, coalesce(nullif(r.call_number, ''), v_call.call_number, ''),
          'Unsolved', v_reason,
          coalesce(r.engineer, ''), coalesce(r.engineer_email, ''),
          (v_day::text || 'T00:00:00Z')::timestamptz,
          jsonb_build_object(
            'Email-ID', v_me,
            'Call Type', coalesce(v_call.call_type, ''),
            'Visit Entry Date', to_char(now() at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'),
            'Visit Date & Time', v_day::text,
            'Update Visit Work Details?', 'No',
            'Spare Request', coalesce(nullif(r.or_no, ''), r.uid)),
          now())
  on conflict (uid) do nothing;

  update public.calls set status = 'Unsolved' where ucn = v_call.ucn;

  return 'filed: ' || v_uid;
end $$;

revoke execute on function public.file_visit_for_spare_request(text) from public, anon;
grant execute on function public.file_visit_for_spare_request(text) to authenticated;

comment on function public.file_visit_for_spare_request(text) is
  'Called by the Spare Request form after a call-based request and its lines are saved: when the call has no visit yet, files one -- Unsolved, the requesting engineer, the request date, pending reason "spare not available" from the master, Update Visit Work Details = No (0333).';
