-- ===========================================================================
-- 0391 — APPROVING AN INDOOR DC DOES NOT PUT A SOLVED CALL BACK TO UNSOLVED
--        (second re-review D-145; the user's decision, 2026-10-04)
--
-- approve_indoor_dc files each unit's drafted visit as Unsolved / Return to
-- Field without asking the call's state. Measured: a call solved by a field
-- visit after the draft received the approval's Unsolved visit as its latest
-- entry, so it read Unsolved, reopen_count 0, nothing saying why.
--
-- THE USER'S DECISION: "Approve, skip that visit" -- the DC is approved and
-- its other units' visits are filed; for a unit whose call is already Solved
-- the drafted visit (and its spares) is NOT filed, the skip is written to the
-- audit log (indoor.visit_skipped) and the approver is told which calls: the
-- function returns "<DC No> | visit not filed, call already Solved: <UCNs>",
-- and the screen shows it. "Solved" is the call's last status beginning with
-- Solved (Solved, Solved - Report Pending ...) -- NOT open_state's "Report
-- pending", which also covers a visit with a blank status.
--
-- Built on 0372's definition (the workshop's Call Status / Pending Reason
-- decide the visit's), VERBATIM, with those lines added -- so the skip applies
-- only where the call is already Solved AND the visit this job would file is
-- not: a visit the workshop records as Solved is still filed.
-- (Written as 0360 against 0327; renumbered after main's 0372 re-stated the
-- function without it, which would otherwise have dropped the skip.)
-- In the indoor module, after 0372.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.approve_indoor_dc(p_dc_no text, p_check_only boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vs     record;
  v_skipped text[] := '{}';
  v_dc    public.indoor_dcs%rowtype;
  j       record;
  v_call  record;
  v_draft jsonb;
  v_uid   text;
  v_me    text;
  v_sp    jsonb;
begin
  select * into v_dc from public.indoor_dcs where dc_no = btrim(p_dc_no) for update;
  if not found then
    raise exception 'Indoor DC % was not found', p_dc_no using errcode = '23503';
  end if;
  if not public.indoor_dc_may_approve(v_dc.authorised_by_name) then
    raise exception 'only % (AUTHORISED BY) or an administrator approves Indoor DC %', coalesce(nullif(v_dc.authorised_by_name, ''), '(nobody named)'), v_dc.dc_no
      using errcode = '42501';
  end if;
  if v_dc.created_by = auth.uid() and not public.is_admin() then
    raise exception 'Indoor DC % was issued by you -- the Reporting Manager, Regional Manager or NSM the User Master names approves it', v_dc.dc_no
      using errcode = '42501';
  end if;
  if v_dc.approval_status <> 'Pending approval' then
    raise exception 'Indoor DC % is %, not pending approval', v_dc.dc_no, v_dc.approval_status
      using errcode = '23514';
  end if;

  -- Every unit with a call must have its visit drafted before anything is
  -- written -- including on a check-only call, so the screen says so first.
  for j in select * from public.indoor_jobs
            where btrim(dispatch_ref) = v_dc.dc_no
              and coalesce(btrim(ucn), '') <> '' and visit_filed_at is null
            order by id loop
    if j.visit_draft is null or jsonb_typeof(j.visit_draft) <> 'object' then
      raise exception '%: no visit was drafted with its Indoor Service Report -- the Indoor engineer completes it (Report stage) before Indoor DC % can be approved', j.job_no, v_dc.dc_no
        using errcode = '23514';
    end if;
    if btrim(coalesce(j.call_status, '')) = 'Unsolved' and btrim(coalesce(j.call_pending_reason, '')) = '' then
      raise exception '%: the Call Status is Unsolved with no Call Pending Reason -- choose one in the Workshop record before Indoor DC % can be approved', j.job_no, v_dc.dc_no
        using errcode = '23514';
    end if;
    if not exists (select 1 from public.calls c where c.ucn = btrim(j.ucn)) then
      raise exception '%: call % was not found -- its visit cannot be filed', j.job_no, btrim(j.ucn)
        using errcode = '23503';
    end if;
  end loop;
  if p_check_only then return 'OK'; end if;

  v_me := coalesce((select nullif(btrim(p.email), '') from public.profiles p where p.id = auth.uid()), auth.email(), '');
  perform set_config('rithi.indoor_visit', 'on', true);

  for j in select * from public.indoor_jobs
            where btrim(dispatch_ref) = v_dc.dc_no
              and coalesce(btrim(ucn), '') <> '' and visit_filed_at is null
            order by id loop
    select c.ucn, c.call_number, c.call_type, c.last_status into v_call from public.calls c where c.ucn = btrim(j.ucn) limit 1;
    v_draft := j.visit_draft;
    -- 0372: the Call Status / Pending Reason chosen on the job's Workshop record.
    select * into v_vs from public.indoor_visit_status(j.call_status, j.call_pending_reason);
    -- D-145 (the user's decision, 2026-10-04: "Approve, skip that visit"): a
    -- call SOLVED since the visit was drafted is not put back to an open
    -- status. When the call's last status is Solved and the visit this job
    -- would file is not, the visit and its spares are not filed, the job keeps
    -- no visit, the skip goes to the audit log, and the approver is told which
    -- calls. A visit the workshop records as Solved (0372) is still filed, and
    -- a visit an earlier attempt already filed is still reused.
    if lower(btrim(coalesce(v_call.last_status, ''))) like 'solved%'
       and lower(btrim(coalesce(v_vs.call_status, ''))) not like 'solved%'
       and not (j.visit_uid is not null and exists (select 1 from public.reports r where r.uid = j.visit_uid)) then
      v_skipped := v_skipped || btrim(j.ucn);
      insert into public.audit_log (actor, role, action, target, status, meta)
      values (v_me, '', 'indoor.visit_skipped', j.job_no, 'ok',
              jsonb_build_object('dc_no', v_dc.dc_no, 'job_no', j.job_no, 'ucn', btrim(j.ucn),
                                 'call_status', coalesce(v_call.last_status, ''),
                                 'reason', 'the call was Solved after the visit was drafted, so the visit was not filed'));
      continue;
    end if;
    -- WHAT THE VISIT ENTRY'S SAVE PATH FILES (fileVisit, CallReporting.tsx),
    -- with the user's fixed Indoor values whatever the draft says: Unsolved /
    -- Return to Field / work details Yes; the report is the uploaded Indoor
    -- Service Report and its number travels as Manual Report No.
    -- A VISIT ALREADY FILED by an earlier attempt through the screen (0323's
    -- path recorded its uid before finishing) is reused, never filed twice;
    -- that path's retry then filed the spares, and so does this.
    if j.visit_uid is not null and exists (select 1 from public.reports r where r.uid = j.visit_uid) then
      v_uid := j.visit_uid;
    else
    v_uid := 'WEB-' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint))
             || '-' || upper(substr(md5(random()::text || j.id::text), 1, 5));
    insert into public.reports (uid, ucn, call_number, manual_report, call_status, pending_reason,
                                engineer, engineer_email, visit_at, data, updated_at)
    values (v_uid, btrim(j.ucn), coalesce(v_call.call_number, ''), coalesce(j.report_file_url, ''),
            v_vs.call_status, v_vs.pending_reason,
            coalesce(v_draft->>'engineer', ''), coalesce(v_draft->>'engineerEmail', ''),
            case when coalesce(v_draft->>'visitDate', '') <> '' then ((v_draft->>'visitDate') || 'T00:00:00Z')::timestamptz end,
            jsonb_build_object(
              'Email-ID', v_me,
              'Call Type', coalesce(v_call.call_type, ''),
              'Visit Entry Date', to_char(now() at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'),
              'Visit Date & Time', coalesce(v_draft->>'visitDate', ''))
            || case when jsonb_typeof(v_draft->'work') = 'object' then v_draft->'work' else '{}'::jsonb end
            -- the fixed values LAST, so nothing in the draft can override them
            || jsonb_build_object('Update Visit Work Details?', 'Yes',
                                  'Manual Report', coalesce(j.report_file_url, ''),
                                  'Manual Report No.', coalesce(j.indoor_report_no, '')),
            now());
    end if;

    -- The drafted spares, every part in ONE statement, as the screen did.
    if jsonb_typeof(v_draft->'spares') = 'array' and jsonb_array_length(v_draft->'spares') > 0 then
      insert into public.spare_consumption (ucn, call_number, part, qty, grir, engineer, engineer_email, data)
      select btrim(j.ucn), coalesce(v_call.call_number, ''), coalesce(sp->>'part', ''),
             coalesce(nullif(sp->>'qty', '')::numeric, 1), coalesce(sp->>'grir', ''),
             coalesce(v_draft->>'engineer', ''), coalesce(v_draft->>'engineerEmail', ''), '{}'::jsonb
        from jsonb_array_elements(v_draft->'spares') sp;
    end if;

    update public.indoor_jobs set visit_uid = v_uid, visit_filed_at = now() where id = j.id;
  end loop;

  update public.indoor_dcs
     set approval_status  = 'Approved',
         approved_by      = auth.uid(),
         approved_at      = now(),
         approved_by_name = coalesce((select coalesce(nullif(btrim(p.full_name), ''), p.email)
                                        from public.profiles p where p.id = auth.uid()), '')
   where id = v_dc.id;
  if array_length(v_skipped, 1) > 0 then
    return v_dc.dc_no || ' | visit not filed, call already Solved: ' || array_to_string(v_skipped, ', ');
  end if;
  return v_dc.dc_no;
end $function$;
