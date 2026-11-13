-- ===========================================================================
-- 0480 -- A v2 REQUEST MAPPED TO A CALL WITH NO VISIT CARRIES ITS VISIT TOO (the
-- user, 2026-11-13, asked whether a mapped request should carry its visit:
-- "If there are no Visit Entries in that call then yes").
--
-- 0475 filed a v2 request's Req_VisitTable row on the call only when the
-- request was REGISTERED as a new call. Now also when it is MAPPED to an
-- existing call -- but only if that call has no visit entry at all. A call
-- that already has visits keeps its own record and nothing is added.
--
-- Worth knowing, and said to the user: a mapping can be undone (Unmap, back to
-- Pending), and a visit is never deleted (0049), so a visit carried onto a
-- call that is later unmapped stays on that call.
--
-- AND THE MOVED VISIT'S ENTRY DATE (the user, the same day: "Visit Entry Date
-- when Moved to the Main Visit Report - Should be the Timestamp of Call
-- Registration + 1 Minute -- i think it is taking the Req_VisitTable timestamp
-- there"): reports.updated_at -- the Visit Entry Date -- and the report's own
-- "Visit Entry Date" are the call's registration time + 1 minute. For a
-- mapped request that is the existing call's registration time. Req_VisitTable
-- keeps its own Visit Entry Date (when the request was saved).
--
-- 0475's body, read out of a database built from every migration; only the
-- status test, the no-visit rule and the entry date changed.
-- ===========================================================================

create or replace function public.req_visit_file_on_register()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v record;
  v_call_no text;
  v_entry   timestamptz;
begin
  if coalesce(new.true_key, '') = '' then return null; end if;
  if lower(btrim(coalesce(new.status, ''))) not in ('registered', 'mapped') or btrim(coalesce(new.ucn, '')) = '' then return null; end if;
  if tg_op = 'UPDATE' then
    if lower(btrim(coalesce(old.status, ''))) = lower(btrim(coalesce(new.status, '')))
       and btrim(coalesce(old.ucn, '')) = btrim(new.ucn) then return null; end if;
  end if;
  -- MAPPED (0480): only onto a call that has no visit entry yet. A call that
  -- already has visits keeps its own record; the request's visit is not added.
  if lower(btrim(coalesce(new.status, ''))) = 'mapped'
     and exists (select 1 from public.reports r where r.ucn = new.ucn) then
    return null;
  end if;

  -- THE VISIT ENTRY DATE IS THE CALL'S REGISTRATION + 1 MINUTE (the user,
  -- 2026-11-13: "Visit Entry Date when Moved to the Main Visit Report - Should
  -- be the Timestamp of Call Registration + 1 Minute"), not the time the
  -- request was saved. Where the call has no registration time, its
  -- registration date at midnight India time; the Req_VisitTable time only if
  -- the call has neither.
  select coalesce(c.call_number, ''),
         coalesce(c.reg_at, (c.reg_date::timestamp at time zone 'Asia/Kolkata')) + interval '1 minute'
    into v_call_no, v_entry
    from public.calls c where c.ucn = new.ucn;
  for v in select * from public.req_visit_table t
            where t.request_unique_key = new.unique_key and t.report_uid = '' loop
    insert into public.reports (uid, ucn, call_number, call_status, pending_reason, engineer, engineer_email,
                                visit_at, updated_at, data)
    values (v.visit_key, new.ucn, coalesce(v_call_no, ''), v.call_status, v.pending_reason, v.engineer, v.engineer_email,
            (v.visit_date::timestamp at time zone 'UTC'), coalesce(v_entry, v.visit_entry_at),
            jsonb_build_object(
              'Email-ID', v.engineer_email,
              'Call Type', coalesce(new.call_type, ''),
              'Visit Entry Date', to_char(coalesce(v_entry, v.visit_entry_at) at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'),
              'Visit Date & Time', to_char(v.visit_date, 'YYYY-MM-DD'),
              'Source', 'Request Registration v2',
              'Request Key', v.visit_key))
    on conflict (uid) do nothing;
    update public.req_visit_table
       set ucn = new.ucn, report_uid = v.visit_key, filed_at = now()
     where visit_key = v.visit_key;
  end loop;
  return null;
end $function$;
