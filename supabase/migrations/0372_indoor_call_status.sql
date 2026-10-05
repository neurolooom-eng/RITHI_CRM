-- ===========================================================================
-- 0372 — INDOOR SERVICE: THE JOB'S CALL STATUS AND CALL PENDING REASON.
--
-- The user, 2026-10-04 (the Repair page's Workshop record): "Move this to Top
-- of this Page, Remove Status and Add - Call Status, Call Pending Reason.
-- Follow the Exact same rule as to Visit Work Details - All Fields should be
-- Mimicked as we are basically calling the same module here." And:
--   * ONE VALUE: what is chosen on the job IS the visit's Call Status and
--     Pending Reason (until now fixed at Unsolved / Return to Field);
--   * the job's own status is DERIVED from it, not chosen:
--       Solved - ...                 -> Ready (a Repair / Rework /
--                                       Troubleshooting first needs its QC
--                                       Pass: until then QC)
--       Unsolved, spare not available -> Awaiting spares
--       Unsolved, any other reason    -> Under repair
--     never once the unit is Dispatched, Closed or Condemned, and not before
--     it is cleaned;
--   * a DEMO / new device (no call) keeps its Status chosen by hand.
-- The visit form's rules, mirrored: the three statuses of that form; a Pending
-- Reason for Unsolved (asked of the DC approval, which files the visit); a
-- report pending reads "Report Pending"; a completed report has none.
-- ===========================================================================

alter table public.indoor_jobs add column if not exists call_status         text not null default '';
alter table public.indoor_jobs add column if not exists call_pending_reason text not null default '';

alter table public.indoor_jobs drop constraint if exists indoor_jobs_call_status_check;
alter table public.indoor_jobs add constraint indoor_jobs_call_status_check
  check (call_status in ('', 'Solved - Report Completed', 'Unsolved', 'Solved - Report Pending'));

-- What the filed visit reads: the job's choice, or -- for a job from before
-- 0372 with none -- the old fixed Unsolved / Return to Field.
create or replace function public.indoor_visit_status(p_status text, p_reason text)
returns table (call_status text, pending_reason text)
language sql immutable set search_path = public as $$
  select case when btrim(coalesce(p_status, '')) = '' then 'Unsolved' else btrim(p_status) end,
         case when btrim(coalesce(p_status, '')) = '' then 'Return to Field'
              when btrim(p_status) = 'Solved - Report Pending' then 'Report Pending'
              when btrim(p_status) = 'Solved - Report Completed' then ''
              else btrim(coalesce(p_reason, '')) end;
$$;

-- THE DERIVATION, BEFORE the guard (zy < zz) so the guard judges the status it
-- produced. Also keeps a saved visit draft in step, so the two never disagree.
create or replace function public.indoor_jobs_call_status()
returns trigger language plpgsql set search_path = public as $$
declare
  st     text := btrim(coalesce(new.call_status, ''));
  rsn    text := upper(btrim(coalesce(new.call_pending_reason, '')));
begin
  -- The visit form's own normalising: a pending report reads Report Pending,
  -- a completed one carries no reason.
  if st = 'Solved - Report Pending' then new.call_pending_reason := 'Report Pending';
  elsif st = 'Solved - Report Completed' then new.call_pending_reason := '';
  end if;

  if coalesce(btrim(new.ucn), '') <> '' and st <> ''
     and new.cleaned_at is not null
     and coalesce(new.status, '') not in ('Dispatched', 'Closed', 'Condemned') then
    if st like 'Solved%' then
      new.status := case when new.activity in ('Repair', 'Rework', 'Troubleshooting')
                              and new.qc_result is distinct from 'Pass' then 'QC' else 'Ready' end;
    elsif rsn like '%SPARE%' and (rsn like '%NOT AVAILABLE%' or rsn like '%UNAVAILABLE%') then
      new.status := 'Awaiting spares';
    else
      new.status := 'Under repair';
    end if;
  end if;

  if st <> '' and new.visit_draft is not null and jsonb_typeof(new.visit_draft) = 'object' then
    new.visit_draft := new.visit_draft || jsonb_build_object(
      'status', st, 'pendingReason', coalesce(new.call_pending_reason, ''), 'updateWork', 'Yes');
  end if;
  return new;
end $$;
revoke execute on function public.indoor_jobs_call_status() from public, anon, authenticated;

drop trigger if exists zy_indoor_jobs_call_status on public.indoor_jobs;
create trigger zy_indoor_jobs_call_status before insert or update on public.indoor_jobs
  for each row execute function public.indoor_jobs_call_status();

-- The guard, re-stated from the database's current definition (0370's) with
-- its visit check reading the job's choice.
CREATE OR REPLACE FUNCTION public.indoor_jobs_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pdt   public.indoor_pdt%rowtype;
  v_blank text[];
  v_bad   text[];
begin
  -- An administrator is not gated by the stage rights; every other rule below
  -- still applies to them, because the ones that follow are about the RECORD
  -- being coherent rather than about who is allowed to act.
  if not public.is_admin() then
    if tg_op = 'UPDATE' then
      if (new.qc_result is distinct from old.qc_result
       or new.qc_by     is distinct from old.qc_by
       or new.qc_at     is distinct from old.qc_at
       or new.qc_notes  is distinct from old.qc_notes)
         and not public.has_perm('indoor.qc') then
        raise exception 'indoor.qc is required to record a quality check'
          using errcode = '42501';
      end if;

      if (new.dispatched_at is distinct from old.dispatched_at
       or new.dispatch_ref  is distinct from old.dispatch_ref
       or new.dispatched_by is distinct from old.dispatched_by)
         and not public.has_perm('indoor.dispatch')
         -- 0323: a REJECTED Indoor DC releases its units through
         -- reject_indoor_dc(), whose approver need not hold indoor.dispatch.
         -- The exemption is a ticket only that definer function can write.
         and not public.indoor_dc_release_ticketed(new.id) then
        raise exception 'indoor.dispatch is required to dispatch a unit'
          using errcode = '42501';
      end if;

      if new.status in ('Dispatched', 'Closed') and new.status is distinct from old.status
         and not public.has_perm('indoor.dispatch') then
        raise exception 'indoor.dispatch is required to mark a unit %', new.status
          using errcode = '42501';
      end if;
    end if;

    -- CONDEMNING IS ITS OWN RIGHT, on insert as well as update. Scrapping
    -- customer property in particular cannot be an engineer's own decision
    -- (open question 8 in the plan, settled here the safe way: a separate
    -- permission granted to nobody by default).
    if (tg_op = 'INSERT' and (btrim(new.condemned_reason) <> '' or new.status = 'Condemned'))
    or (tg_op = 'UPDATE' and (new.condemned_reason is distinct from old.condemned_reason
                           or new.condemned_at     is distinct from old.condemned_at
                           or (new.status = 'Condemned' and old.status <> 'Condemned'))) then
      if not public.has_perm('indoor.condemn') then
        raise exception 'indoor.condemn is required to condemn a unit'
          using errcode = '42501';
      end if;
      if new.condemned_at is null then new.condemned_at := now(); end if;
      if new.condemned_by is null then new.condemned_by := auth.uid(); end if;
    end if;
  end if;

  -- A MACHINE CANNOT LEAVE WITH A FAILED CHECK. 4.5.6 puts the quality check
  -- before the return, so a failed one sends it back to Under repair rather
  -- than being noted and stepped over.
  if new.status in ('Ready', 'Dispatched', 'Closed') and new.qc_result = 'Fail' then
    raise exception 'the quality check failed -- the unit returns to Under repair, it does not leave'
      using errcode = '23514';
  end if;

  -- AND A REPAIR OR REWORK CANNOT LEAVE WITH NO CHECK AT ALL. The other four
  -- activities are exempt on purpose: a demo going out and a unit stripped for
  -- parts have no repair to verify, and a pre-delivery inspection records its
  -- verdict in pdi_result instead.
  if new.status in ('Dispatched', 'Closed')
     and new.activity in ('Repair', 'Rework', 'Troubleshooting')
     and new.qc_result is null then
    raise exception 'a % cannot be dispatched before its quality check is recorded (4.5.6)', lower(new.activity)
      using errcode = '23514';
  end if;

  -- A FAILED PRE-DELIVERY INSPECTION DOES NOT SHIP either, and a held one says
  -- why it is being held.
  if new.status in ('Dispatched', 'Closed')
     and new.activity = 'Pre-delivery inspection' and new.pdi_result = 'Fail' then
    raise exception 'a failed pre-delivery inspection does not leave the workshop'
      using errcode = '23514';
  end if;

  -- Timestamps that follow from an action are stamped, not typed: a cleaning
  -- date somebody can type is a cleaning date somebody can back-date.
  if new.status <> 'Received' and old is distinct from null then
    if new.cleaned_by is distinct from coalesce(old.cleaned_by, new.cleaned_by)
       and new.cleaned_at is null then
      new.cleaned_at := now();
    end if;
  end if;
  if new.qc_result is not null and new.qc_at is null then
    new.qc_at := now();
    if new.qc_by is null then new.qc_by := auth.uid(); end if;
  end if;
  if new.dispatch_ref <> '' and new.dispatched_at is null then
    new.dispatched_at := now();
    if new.dispatched_by is null then new.dispatched_by := auth.uid(); end if;
  end if;

  -- ======================== 0320 ========================================

  -- R/SER/QC/007. A DEMO UNIT OF AN IMPORTED PRODUCT DOES NOT LEAVE UNTESTED.
  -- Asked on the MOVE into Dispatched / Closed (or a job filed or re-kinded
  -- straight into one), not on every later edit: a unit already out before
  -- this rule existed can still be verified and remarked. UNKNOWN imported-ness
  -- does not require the test -- the user's decision; the screen says unknown.
  if new.kind = 'DEMO unit' and new.status in ('Dispatched', 'Closed')
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.kind is distinct from old.kind
          or new.product_name is distinct from old.product_name
          or new.serial is distinct from old.serial)
     and coalesce(public.indoor_job_is_imported(new.product_name, new.serial), false) then
    select * into v_pdt from public.indoor_pdt where job_id = new.id;
    if not found then
      raise exception 'a DEMO unit of an imported product does not leave before its Pre-Delivery Testing (R/SER/QC/007) is recorded'
        using errcode = '23514';
    end if;
    v_bad := array_remove(array[
      case when v_pdt.check1 = 'NOT OK' then '1' end,
      case when v_pdt.check2 = 'NOT OK' then '2' end,
      case when v_pdt.check3 = 'NOT OK' then '3' end,
      case when v_pdt.check4 = 'NOT OK' then '4' end,
      case when v_pdt.check5 = 'NOT OK' then '5' end], null);
    if cardinality(v_bad) > 0 then
      raise exception 'Pre-Delivery Testing check % reads NOT OK -- a machine cannot leave with a failed check',
        array_to_string(v_bad, ', ')
        using errcode = '23514';
    end if;
    v_blank := array_remove(array[
      case when v_pdt.test_date is null then 'Date' end,
      case when btrim(v_pdt.measuring_equipment_id) = '' then 'Measuring Equipment ID No' end,
      case when btrim(v_pdt.software_version) = '' then 'Software Version' end,
      case when btrim(v_pdt.hv) = '' then 'HV' end,
      case when btrim(v_pdt.ht) = '' then 'HT' end,
      case when v_pdt.check1 is null or v_pdt.check2 is null or v_pdt.check3 is null
             or v_pdt.check4 is null or v_pdt.check5 is null then 'checks 1-5' end,
      case when v_pdt.cmv_vte_21 is null or v_pdt.cmv_vte_60 is null or v_pdt.cmv_vte_100 is null
             or v_pdt.cmv_peep_21 is null or v_pdt.cmv_peep_60 is null or v_pdt.cmv_peep_100 is null
             or v_pdt.cmv_o2_21 is null or v_pdt.cmv_o2_60 is null or v_pdt.cmv_o2_100 is null
           then 'the CMV/ACMV readings' end,
      case when v_pdt.pcmv_pip_21 is null or v_pdt.pcmv_pip_60 is null or v_pdt.pcmv_pip_100 is null
             or v_pdt.pcmv_peep_21 is null or v_pdt.pcmv_peep_60 is null or v_pdt.pcmv_peep_100 is null
             or v_pdt.pcmv_o2_21 is null or v_pdt.pcmv_o2_60 is null or v_pdt.pcmv_o2_100 is null
           then 'the PCMV readings' end,
      case when v_pdt.inspected_by is null then 'Inspected by (not signed)' end], null);
    if cardinality(v_blank) > 0 then
      raise exception 'Pre-Delivery Testing (R/SER/QC/007) is incomplete -- still blank: %',
        array_to_string(v_blank, ', ')
        using errcode = '23514';
    end if;
  end if;

  -- R/SER/07 "VERIFIED BY". Its own key; only on a completed row; who and when
  -- from the session. On insert there is nothing to verify yet, so whatever
  -- was sent is discarded.
  if tg_op = 'INSERT' then
    new.verified_by := null;
    new.verified_at := null;
  elsif new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at then
    if not public.has_perm('indoor.verify') then
      raise exception 'indoor.verify is required to verify an Indoor Service register entry'
        using errcode = '42501';
    end if;
    if new.verified_by is null then
      new.verified_at := null;               -- a verification withdrawn
    else
      if new.status not in ('Dispatched', 'Closed', 'Condemned') then
        raise exception 'a register entry is verified once the unit is Dispatched, Closed or Condemned -- this one is %', new.status
          using errcode = '23514';
      end if;
      new.verified_by := auth.uid();
      new.verified_at := now();
    end if;
  end if;

  -- R/SER/07 "Status" is the COVER, in the one vocabulary (0208), where that
  -- rule is installed. Run-time lookup: data_integrity runs after this module.
  if new.cover is distinct from (case when tg_op = 'UPDATE' then old.cover end)
     and to_regprocedure('public.cover_code(text)') is not null then
    execute 'select public.cover_code($1)' into new.cover using new.cover;
    new.cover := coalesce(new.cover, '');
  end if;


  -- ======================== 0323 ========================================

  -- A UNIT ON AN INDOOR DC THAT IS STILL PENDING APPROVAL DOES NOT LEAVE.
  -- Asked on the move into Dispatched / Closed.
  if new.status in ('Dispatched', 'Closed')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and btrim(coalesce(new.dispatch_ref, '')) <> ''
     and exists (select 1 from public.indoor_dcs d
                  where d.dc_no = btrim(new.dispatch_ref) and d.approval_status = 'Pending approval') then
    raise exception 'Indoor DC % is still pending approval -- the unit is dispatched once it is approved', btrim(new.dispatch_ref)
      using errcode = '23514';
  end if;

  -- STAGE 4 -- THE INDOOR SERVICE REPORT. Uploaded after CLEANING, with its
  -- number; the indoor.work right; who and when from the session.
  if new.report_file_url is distinct from (case when tg_op = 'UPDATE' then old.report_file_url end)
     and btrim(coalesce(new.report_file_url, '')) <> '' then
    if not public.is_admin() and not public.has_perm('indoor.work') then
      raise exception 'indoor.work is required to upload the Indoor Service Report'
        using errcode = '42501';
    end if;
    if new.cleaned_at is null then
      raise exception 'the Indoor Service Report is uploaded after cleaning (WI/SER/01) -- this unit has not been cleaned yet'
        using errcode = '23514';
    end if;
    if btrim(coalesce(new.indoor_report_no, '')) = '' then
      raise exception 'an uploaded Indoor Service Report needs its Indoor Service Report No'
        using errcode = '23514';
    end if;
    new.report_uploaded_by := auth.uid();
    new.report_uploaded_at := now();
  elsif btrim(coalesce(new.report_file_url, '')) = '' then
    new.report_file_url    := '';
    new.report_file_name   := '';
    new.report_uploaded_by := null;
    new.report_uploaded_at := null;
  elsif tg_op = 'UPDATE' then
    new.report_uploaded_by := old.report_uploaded_by;   -- unchanged file: the stamps stand
    new.report_uploaded_at := old.report_uploaded_at;
  end if;

  -- STAGE 5 -- THE VISIT FILED FROM THE DRAFT. visit_uid must be a visit of
  -- THIS job's call; visit_filed_at is stamped, and only once a visit is named.
  if new.visit_uid is distinct from (case when tg_op = 'UPDATE' then old.visit_uid end)
     and new.visit_uid is not null then
    if new.ucn is null or not exists (select 1 from public.reports r
                                       where r.uid = new.visit_uid and r.ucn = new.ucn) then
      raise exception 'visit % is not a visit of call % -- a job records only the visit filed against its own call',
        new.visit_uid, coalesce(new.ucn, '(none)')
        using errcode = '23514';
    end if;
    -- THE USER'S RULE FOR THIS VISIT (2026-10-02): the unit goes back to the
    -- field, so the call is Unsolved, pending "Return to Field", with the work
    -- details updated. A visit saying anything else is not the one this stage
    -- files.
    -- 0372: the visit reads the Call Status and Pending Reason chosen on the
    -- job's Workshop record (a job from before 0372 with none chosen keeps the
    -- old fixed Unsolved / Return to Field).
    if not exists (select 1 from public.reports r, public.indoor_visit_status(new.call_status, new.call_pending_reason) v
                    where r.uid = new.visit_uid
                      and r.call_status = v.call_status
                      and coalesce(r.pending_reason, '') = coalesce(v.pending_reason, '')
                      and r.data ->> 'Update Visit Work Details?' = 'Yes') then
      raise exception 'visit % does not read the Call Status / Pending Reason chosen on the job, with Update Visit Work Details? = Yes',
        new.visit_uid
        using errcode = '23514';
    end if;
    if btrim(coalesce(new.report_file_url, '')) = '' then
      raise exception 'the visit is filed from the Indoor Service Report stage -- upload the report first'
        using errcode = '23514';
    end if;
  end if;
  if new.visit_uid is null then
    new.visit_filed_at := null;
  elsif new.visit_filed_at is distinct from (case when tg_op = 'UPDATE' then old.visit_filed_at end) then
    new.visit_filed_at := case when new.visit_filed_at is null then null else now() end;
  end if;

  return new;
end $function$;

-- approve_indoor_dc(), re-stated from the database's current definition
-- (0327's), filing the visit with the job's choice and refusing an Unsolved
-- job with no Pending Reason.
CREATE OR REPLACE FUNCTION public.approve_indoor_dc(p_dc_no text, p_check_only boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vs     record;
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
    select c.ucn, c.call_number, c.call_type into v_call from public.calls c where c.ucn = btrim(j.ucn) limit 1;
    v_draft := j.visit_draft;
    -- 0372: the Call Status / Pending Reason chosen on the job's Workshop record.
    select * into v_vs from public.indoor_visit_status(j.call_status, j.call_pending_reason);
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
  return v_dc.dc_no;
end $function$;
