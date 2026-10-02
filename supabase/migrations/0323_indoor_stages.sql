-- ===========================================================================
-- 0323 — THE INDOOR SERVICE WORKFLOW AS STAGES: INTAKE -> CLEANING -> REPAIR
--        -> SERVICE REPORT (+ the visit, drafted) -> INDOOR_DC (+ the visit,
--        filed)
--
-- The user, 2026-10-02, describing how Ajay G (Indoor Service Engineer) and
-- Vignesh (head of Indoor Service) actually work, and asking for the screen to
-- be rebuilt around the stages. The decisions, and where each one lives:
--
--   INTAKE. A job is received FROM A CALL (product + serial lists its open
--   calls, or the UCN is typed) and fills from the call; or as a DEMO / new
--   device with no call. The call's Standard Complaint is shown beside the
--   Problem Reported, so it is kept: `standard_complaint` (snapshot at intake;
--   the indoor engineer may not be able to read the call later).
--   The RECEIVED ACCESSORIES are an add-item list WITH A QUANTITY: `qty` on
--   indoor_job_accessories, default 1, > 0.
--
--   SERVICE REPORT UPLOAD (stage 4). The report number (indoor_report_no, 0320)
--   and the uploaded file's link: report_file_url / report_file_name, with
--   report_uploaded_by / report_uploaded_at STAMPED from the session (a value
--   sent is discarded). REFUSED UNTIL THE UNIT IS CLEANED and refused without a
--   report number -- the order the user set: cleaning before upload. Uploading
--   is the indoor.work right (the work, not a new key).
--   For a job WITH A UCN the same form captures the VISIT -- every field of the
--   Visit Entry, by the Visit Entry's own form and rules -- as a DRAFT on the
--   job: `visit_draft` (jsonb) and `visit_date`. Nothing is written to the call.
--
--   INDOOR_DC (stage 5). "When the DC is approved add an entry to Visit entry
--   against the UCN" -- the DC is approved when it is issued (Authorised By is
--   recorded then; there is no other approval step). The screen FILES the
--   drafted visit through the Visit Entry's own save path BEFORE asking for the
--   DC, and records it on the job: `visit_uid` (the reports row) and
--   `visit_filed_at` (spares and feedback written too). create_indoor_dc() then
--   REFUSES a job with a UCN whose visit is not filed, and any job whose report
--   is not uploaded. A job with no UCN (a DEMO unit) files no visit.
--   AUTHORISED BY is chosen from the issuer's Reporting Manager, Regional
--   Manager (user_directory) and every active NSM (indoor_dc_authorisers()),
--   stored on the DC as `authorised_by_name` and printed.
--   THE DC DATE IS THE DATE OF ENTRY: create_indoor_dc() no longer takes one.
--   THE LINES CARRY THE ACCESSORIES' QUANTITIES as received.
--   A check-only call (p_check_only) asks every DC rule except "the visit is
--   filed" and writes nothing, so the screen can be refused BEFORE it files
--   visits for a DC that would not be issued.
--
-- The guard is 0320's body WORD FOR WORD with the new rules added after it;
-- create_indoor_dc is 0321's body with the changes above. Every rule either
-- carried is still here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. COLUMNS
-- ---------------------------------------------------------------------------
alter table public.indoor_job_accessories
  add column if not exists qty numeric not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'indoor_job_accessories_qty_positive') then
    alter table public.indoor_job_accessories
      add constraint indoor_job_accessories_qty_positive check (qty > 0);
  end if;
end $$;
comment on column public.indoor_job_accessories.qty is
  'How many of this accessory were RECEIVED with the unit (0323). Printed on the Indoor DC line.';

alter table public.indoor_jobs
  add column if not exists standard_complaint  text not null default '',
  add column if not exists report_file_url     text not null default '',
  add column if not exists report_file_name    text not null default '',
  add column if not exists report_uploaded_by  uuid,
  add column if not exists report_uploaded_at  timestamptz,
  add column if not exists visit_draft         jsonb,
  add column if not exists visit_date          date,
  add column if not exists visit_uid           text,
  add column if not exists visit_filed_at      timestamptz;

comment on column public.indoor_jobs.standard_complaint is
  'The call''s Standard Complaint as it read when the unit was received from that call (0323). Shown read-only beside Problem Reported.';
comment on column public.indoor_jobs.report_file_url is
  'The uploaded Indoor Service Report (stage 4), filed in Drive as "<Indoor Service Report No>_<original file name>". Refused until the unit is cleaned and without a report number; who and when are stamped (0323).';
comment on column public.indoor_jobs.visit_draft is
  'For a job with a UCN: the Visit Entry answers captured with the report upload, a DRAFT. Filed against the UCN by the Visit Entry''s own save path when the Indoor DC is issued (0323).';
comment on column public.indoor_jobs.visit_uid is
  'The reports row (visit) filed against the UCN from this job''s draft (0323). Must name a visit of this job''s UCN.';
comment on column public.indoor_jobs.visit_filed_at is
  'When the drafted visit was filed in full -- the visit, its spares and its feedback (0323). Stamped; create_indoor_dc() requires it for a job with a UCN.';

alter table public.indoor_dcs
  add column if not exists authorised_by_name text not null default '',
  add column if not exists approval_status    text not null default 'Pending approval',
  add column if not exists approved_by        uuid,
  add column if not exists approved_by_name   text not null default '',
  add column if not exists approved_at        timestamptz,
  add column if not exists rejected_by        uuid,
  add column if not exists rejected_at        timestamptz,
  add column if not exists rejection_reason   text not null default '';
-- A DC issued BEFORE approval existed (0321 alone) was never put to anybody:
-- it reads as such rather than as approved by nobody, or as pending for ever.
-- Only rows with no Authorised By and no decision are touched; a DC made since
-- 0323 always names its Authorised By, so a re-run changes nothing.
update public.indoor_dcs
   set approval_status = 'Issued before approval'
 where approval_status = 'Pending approval' and btrim(authorised_by_name) = ''
   and approved_at is null and rejected_at is null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'indoor_dcs_approval_status_check') then
    alter table public.indoor_dcs add constraint indoor_dcs_approval_status_check
      check (approval_status in ('Pending approval', 'Approved', 'Rejected', 'Issued before approval'));
  end if;
end $$;
comment on column public.indoor_dcs.authorised_by_name is
  'AUTHORISED BY on the Indoor DC: one of indoor_dc_authorisers() for the issuer, named when the DC was created (0323). That person -- by their User Master name -- or an administrator approves or rejects it.';
comment on column public.indoor_dcs.approval_status is
  'Pending approval (on creation) -> Approved (approve_indoor_dc, which needs every UCN job''s visit filed) or Rejected (reject_indoor_dc, which releases the units). Issued before approval = a DC made before 0323 (0323).';

-- THE RELEASE TICKET. A rejected DC clears its units' DC No.; the guard asks
-- indoor.dispatch for that, which the approver (a manager, an NSM) need not
-- hold. The exemption is a row here: RLS on, NO policy, no grant -- written
-- only by reject_indoor_dc() (definer) and read only by the guard (definer),
-- for the job and the transaction it was written in. A transaction-local
-- setting would be forgeable (set_config is anybody's), which is 0196's
-- lesson.
create table if not exists public.indoor_dc_release_tickets (
  job_id bigint not null,
  tx     bigint not null,
  primary key (job_id, tx)
);
alter table public.indoor_dc_release_tickets enable row level security;
revoke all on public.indoor_dc_release_tickets from public;
do $$ begin
  execute 'revoke all on public.indoor_dc_release_tickets from anon, authenticated';
exception when undefined_object then null; end $$;

-- The five system columns, where the module that adds them already ran (on a
-- fresh build sys_columns runs later and attaches them itself). Not a counter,
-- so not on 0244's exclusion list.
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.indoor_dc_release_tickets'::regclass);
  end if;
end $$;

create or replace function public.indoor_dc_release_ticketed(p_job_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.indoor_dc_release_tickets t
                  where t.job_id = p_job_id and t.tx = txid_current());
$$;
revoke all on function public.indoor_dc_release_ticketed(bigint) from public;
do $$ begin
  execute 'revoke all on function public.indoor_dc_release_ticketed(bigint) from anon, authenticated';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. WHO MAY AUTHORISE THE ISSUER'S DC -- their Reporting Manager and Regional
--    Manager as the User Master names them, and every active NSM.
--    The issuer is the SESSION: matched to the User Master by the login's
--    email, the way my_dir_name() matches (email or gmail). SECURITY DEFINER
--    because profiles is readable row-by-row only to its owner; it returns
--    names and nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.indoor_dc_authorisers()
returns table (name text, basis text)
language sql stable security definer
set search_path = public
as $$
  with me as (
    select lower(btrim(coalesce(p.email, auth.email(), ''))) as em
      from (select 1) x left join public.profiles p on p.id = auth.uid()
  ), dir as (
    select d.reporting_manager, d.regional_manager
      from public.user_directory d, me
     where me.em <> '' and (lower(btrim(coalesce(d.email, ''))) = me.em or lower(btrim(coalesce(d.gmail, ''))) = me.em)
     order by d.validity desc, d.id
     limit 1
  ), cand as (
    select btrim(reporting_manager) as name, 'Reporting Manager'::text as basis, 1 as o from dir
    union all
    select btrim(regional_manager), 'Regional Manager', 2 from dir
    union all
    select coalesce(nullif(btrim(p.full_name), ''), p.email), 'NSM', 3
      from public.profiles p where p.role = 'nsm' and p.active
  )
  select name, string_agg(basis, ' / ' order by o) as basis
    from cand where coalesce(name, '') <> ''
   group by name
   order by min(o), name;
$$;
comment on function public.indoor_dc_authorisers() is
  'AUTHORISED BY choices for an Indoor DC issued by the signed-in user (0323): their Reporting Manager and Regional Manager on the User Master, and every active profile whose role is NSM.';
revoke all on function public.indoor_dc_authorisers() from public;
do $$ begin
  execute 'revoke all on function public.indoor_dc_authorisers() from anon';
  execute 'grant execute on function public.indoor_dc_authorisers() to authenticated';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. THE GUARD -- 0320 verbatim, then 0323's rules.
-- ---------------------------------------------------------------------------
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
     and new.activity in ('Repair', 'Rework')
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
    if not exists (select 1 from public.reports r
                    where r.uid = new.visit_uid
                      and r.call_status = 'Unsolved'
                      and r.pending_reason = 'Return to Field'
                      and r.data ->> 'Update Visit Work Details?' = 'Yes') then
      raise exception 'visit % does not read Unsolved / Return to Field / Update Visit Work Details? = Yes -- the visit filed from Indoor Service always does',
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
drop trigger if exists zz_indoor_jobs_guard on public.indoor_jobs;
create trigger zz_indoor_jobs_guard before insert or update on public.indoor_jobs
  for each row execute function public.indoor_jobs_guard();

-- ---------------------------------------------------------------------------
-- 4. ISSUING A DC -- 0321's create_indoor_dc() with 0323's changes:
--      * NO DC DATE PARAMETER: the DC date is the date of entry (today, India);
--      * every job must carry its uploaded Indoor Service Report;
--      * AUTHORISED BY, one of indoor_dc_authorisers(), REQUIRED: the DC is
--        created PENDING APPROVAL and that person approves it (section 5);
--      * an accessory line's QTY is the quantity received.
--    The old signature is DROPPED (a call with p_dc_date would otherwise still
--    reach the 0321 version and skip every new rule).
-- ---------------------------------------------------------------------------
drop function if exists public.create_indoor_dc(bigint[], text, date, text, date, text, text, jsonb);

create or replace function public.create_indoor_dc(
  p_job_ids           bigint[],
  p_consignee         text,
  p_customer_ref      text    default '',
  p_customer_ref_date date    default null,
  p_mode              text    default '',
  p_purpose           text    default '',
  p_line_purposes     jsonb   default '[]'::jsonb,
  p_authorised_by     text    default ''
) returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_ids   bigint[];
  v_date  date := (now() at time zone 'Asia/Kolkata')::date;
  v_dc    bigint;
  v_no    text;
  v_line  integer := 0;
  v_state text;
  v_msg   text;
  v_keys  text;
  v_auth  text;
  j       record;
  a       record;
  v_ov    jsonb;
begin
  if not public.has_perm('indoor.dispatch') then
    raise exception 'indoor.dispatch is required to issue an Indoor DC'
      using errcode = '42501';
  end if;

  select array_agg(x order by o) into v_ids
    from (select x, min(o) as o from unnest(p_job_ids) with ordinality u(x, o)
           where x is not null group by x) d;
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'choose at least one Ready unit for the Indoor DC'
      using errcode = '22023';
  end if;
  if coalesce(btrim(p_consignee), '') = '' then
    raise exception 'an Indoor DC needs its consignee (To)'
      using errcode = '23514';
  end if;

  -- AUTHORISED BY: one of the issuer's choices, matched without regard to case
  -- and stored as the list spells it. REQUIRED -- it names who approves.
  if coalesce(btrim(p_authorised_by), '') = '' then
    raise exception 'choose who AUTHORISES this Indoor DC (your Reporting Manager, Regional Manager or an NSM) -- they approve it'
      using errcode = '23514';
  end if;
  select au.name into v_auth from public.indoor_dc_authorisers() au
   where upper(btrim(au.name)) = upper(btrim(p_authorised_by))
   limit 1;
  if v_auth is null then
    raise exception 'AUTHORISED BY must be your Reporting Manager, your Regional Manager or an NSM -- % is none of them', btrim(p_authorised_by)
      using errcode = '23514';
  end if;

  -- Every job must exist, and is locked for the rest of the transaction so two
  -- people cannot put one unit on two challans at once.
  perform 1 from public.indoor_jobs where id = any (v_ids) order by id for update;
  if (select count(*) from public.indoor_jobs where id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'an Indoor Service job on this DC was not found'
      using errcode = '23503';
  end if;

  -- ONE DC, ONE CONSIGNEE: a customer unit goes to its party, a DEMO unit to
  -- its "going to" party.
  select string_agg(distinct coalesce(nullif(btrim(k), ''), '(none)'), ' / ') into v_keys
    from (select case when kind = 'DEMO unit' then demo_for_party else party_name end as k
            from public.indoor_jobs where id = any (v_ids)) s;
  if (select count(distinct upper(btrim(coalesce(case when kind = 'DEMO unit' then demo_for_party
                                                       else party_name end, ''))))
        from public.indoor_jobs where id = any (v_ids)) > 1 then
    raise exception 'one Indoor DC goes to one consignee -- these units go to %', v_keys
      using errcode = '23514';
  end if;

  for j in
    select ij.*, u.o from public.indoor_jobs ij
      join unnest(v_ids) with ordinality u(x, o) on u.x = ij.id
     order by u.o
  loop
    if j.status <> 'Ready' then
      raise exception '%: only a Ready unit goes on an Indoor DC -- this one is %', j.job_no, j.status
        using errcode = '23514';
    end if;
    if btrim(j.dispatch_ref) <> '' then
      raise exception '%: already carries DC No. % -- one unit, one DC', j.job_no, j.dispatch_ref
        using errcode = '23514';
    end if;
    -- 0323: THE REPORT BEFORE THE DC, AND THE VISIT WITH IT.
    if btrim(coalesce(j.report_file_url, '')) = '' then
      raise exception '%: the Indoor Service Report has not been uploaded -- a unit goes on an Indoor DC after its report', j.job_no
        using errcode = '23514';
    end if;

    -- THE TRIAL. Would the guard let this unit leave? Asked by moving it to
    -- Dispatched and always rolling the move back.
    begin
      update public.indoor_jobs set status = 'Dispatched' where id = j.id;
      raise exception using errcode = 'P0001', message = 'indoor_dc_trial_passed';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      if v_msg <> 'indoor_dc_trial_passed' then
        raise exception '%: %', j.job_no, v_msg using errcode = v_state;
      end if;
    end;
  end loop;

  -- Overrides must name a job on this DC (a purpose for a unit that is not
  -- here is a mistake, said rather than dropped).
  for v_ov in select * from jsonb_array_elements(coalesce(p_line_purposes, '[]'::jsonb)) loop
    if not coalesce((v_ov ->> 'job_id')::bigint = any (v_ids), false) then
      raise exception 'a line purpose names job %, which is not on this DC', v_ov ->> 'job_id'
        using errcode = '22023';
    end if;
  end loop;

  insert into public.indoor_dcs (dc_no, dc_date, consignee, customer_ref, customer_ref_date,
                                 mode_of_despatch, purpose, authorised_by_name, approval_status)
  values ('auto', v_date, btrim(p_consignee), btrim(coalesce(p_customer_ref, '')), p_customer_ref_date,
          btrim(coalesce(p_mode, '')), btrim(coalesce(p_purpose, '')), v_auth, 'Pending approval')
  returning id, dc_no into v_dc, v_no;

  for j in
    select ij.*, u.o from public.indoor_jobs ij
      join unnest(v_ids) with ordinality u(x, o) on u.x = ij.id
     order by u.o
  loop
    v_line := v_line + 1;
    insert into public.indoor_dc_lines (dc_id, line_no, job_id, accessory_id, part_no, description, qty, purpose)
    values (v_dc, v_line, j.id, null,
            coalesce(public.indoor_job_product_code(j.product_name, j.serial), ''),
            btrim(btrim(j.product_name) || case when btrim(j.serial) <> '' then ' Sl.No ' || btrim(j.serial) else '' end),
            1,
            coalesce((select e ->> 'purpose' from jsonb_array_elements(coalesce(p_line_purposes, '[]'::jsonb)) e
                       where (e ->> 'job_id')::bigint = j.id
                         and nullif(e ->> 'accessory_id', '') is null
                       limit 1), btrim(coalesce(p_purpose, ''))));
    for a in
      select * from public.indoor_job_accessories
       where job_id = j.id and (btrim(name) <> '' or btrim(serial) <> '')
       order by id
    loop
      v_line := v_line + 1;
      insert into public.indoor_dc_lines (dc_id, line_no, job_id, accessory_id, part_no, description, qty, purpose)
      values (v_dc, v_line, j.id, a.id, '',
              btrim(btrim(a.name) || case when btrim(a.serial) <> '' then ' Sl.No ' || btrim(a.serial) else '' end),
              a.qty,
              coalesce((select e ->> 'purpose' from jsonb_array_elements(coalesce(p_line_purposes, '[]'::jsonb)) e
                         where (e ->> 'job_id')::bigint = j.id
                           and (e ->> 'accessory_id')::bigint = a.id
                         limit 1), btrim(coalesce(p_purpose, ''))));
    end loop;
  end loop;

  -- THE STAMP ON EACH JOB. Through the guard, as the caller: it asks
  -- indoor.dispatch for a change of dispatch_ref and stamps dispatched_at /
  -- dispatched_by, exactly as a reference typed on the job does.
  update public.indoor_jobs
     set dispatch_ref = v_no, dc_date = v_date
   where id = any (v_ids);

  return v_no;
end $$;
comment on function public.create_indoor_dc(bigint[], text, text, date, text, text, jsonb, text) is
  'Issues an Indoor DC PENDING APPROVAL (0321, 0323): asks indoor.dispatch; one consignee; only Ready units with no DC No. and an uploaded Indoor Service Report; AUTHORISED BY required, one of indoor_dc_authorisers(); DC date = today (India); each unit TRIED against indoor_jobs_guard()''s leaving rules; lines from the jobs and their accessories with the quantities received; each job stamped dispatch_ref and dc_date (its reservation). Returns the IDC number.';
revoke all on function public.create_indoor_dc(bigint[], text, text, date, text, text, jsonb, text) from public;
do $$ begin
  execute 'revoke all on function public.create_indoor_dc(bigint[], text, text, date, text, text, jsonb, text) from anon';
  execute 'grant execute on function public.create_indoor_dc(bigint[], text, text, date, text, text, jsonb, text) to authenticated';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 5. THE APPROVAL -- the Indoor DC's own, and only the Indoor DC's (the user:
--    "Only the INDOOR DC needs an approval"; the spare DC is untouched).
--
--    WHO: the person named as AUTHORISED BY, recognised by the name the User
--    Master gives their login (my_dir_name()) or, failing that, their profile
--    name -- or an administrator. Anybody else is refused.
--
--    APPROVE: every job on the DC that has a UCN must have its drafted visit
--    FILED first (the screen files it, through the Visit Entry's own save
--    path, as the approver, and records it with record_indoor_visit()); then
--    approved_by / approved_at / approved_by_name are stamped from the
--    session. p_check_only asks who and what state, and nothing else, so the
--    screen is refused BEFORE it files any visit.
--
--    REJECT: a reason, then the units are RELEASED -- DC No., DC date and the
--    dispatch stamps cleared through the guard on a release ticket -- so a new
--    DC can be made. The DC is kept, never deleted.
-- ---------------------------------------------------------------------------
create or replace function public.indoor_dc_may_approve(p_authorised_by text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (coalesce(btrim(p_authorised_by), '') <> ''
          and upper(btrim(p_authorised_by)) in (
                upper(btrim(coalesce(public.my_dir_name(), ''))),
                upper(btrim(coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), '')))));
$$;
comment on function public.indoor_dc_may_approve(text) is
  'May the signed-in user approve or reject an Indoor DC whose AUTHORISED BY reads p_authorised_by? Their User Master name or profile name matches it, or they are an administrator (0323).';
revoke all on function public.indoor_dc_may_approve(text) from public;
do $$ begin
  execute 'revoke all on function public.indoor_dc_may_approve(text) from anon';
  execute 'grant execute on function public.indoor_dc_may_approve(text) to authenticated';
exception when undefined_object then null; end $$;

-- Recording the visit filed for a job at approval. The approver need hold no
-- indoor right, so this is the one writer of visit_uid / visit_filed_at for
-- them; the guard still checks the visit is this call's and reads Unsolved /
-- Return to Field / Yes.
create or replace function public.record_indoor_visit(p_job_id bigint, p_visit_uid text, p_complete boolean default false)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_dc public.indoor_dcs%rowtype;
begin
  select d.* into v_dc from public.indoor_dcs d
    join public.indoor_jobs j on btrim(j.dispatch_ref) = d.dc_no
   where j.id = p_job_id and d.approval_status = 'Pending approval'
   limit 1;
  if not found then
    raise exception 'job % is not on an Indoor DC awaiting approval -- its visit is filed when that DC is approved', p_job_id
      using errcode = '23514';
  end if;
  if not public.indoor_dc_may_approve(v_dc.authorised_by_name) then
    raise exception 'only % (AUTHORISED BY on %) or an administrator files the visits of that DC', v_dc.authorised_by_name, v_dc.dc_no
      using errcode = '42501';
  end if;
  update public.indoor_jobs
     set visit_uid = nullif(btrim(coalesce(p_visit_uid, '')), ''),
         visit_filed_at = case when p_complete then now() else null end
   where id = p_job_id;
end $$;
revoke all on function public.record_indoor_visit(bigint, text, boolean) from public;
do $$ begin
  execute 'revoke all on function public.record_indoor_visit(bigint, text, boolean) from anon';
  execute 'grant execute on function public.record_indoor_visit(bigint, text, boolean) to authenticated';
exception when undefined_object then null; end $$;

create or replace function public.approve_indoor_dc(p_dc_no text, p_check_only boolean default false)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_dc   public.indoor_dcs%rowtype;
  v_todo text;
begin
  select * into v_dc from public.indoor_dcs where dc_no = btrim(p_dc_no) for update;
  if not found then
    raise exception 'Indoor DC % was not found', p_dc_no using errcode = '23503';
  end if;
  if not public.indoor_dc_may_approve(v_dc.authorised_by_name) then
    raise exception 'only % (AUTHORISED BY) or an administrator approves Indoor DC %', coalesce(nullif(v_dc.authorised_by_name, ''), '(nobody named)'), v_dc.dc_no
      using errcode = '42501';
  end if;
  if v_dc.approval_status <> 'Pending approval' then
    raise exception 'Indoor DC % is %, not pending approval', v_dc.dc_no, v_dc.approval_status
      using errcode = '23514';
  end if;
  if p_check_only then return 'OK'; end if;

  select string_agg(j.job_no || ' (' || j.ucn || ')', ', ' order by j.id) into v_todo
    from public.indoor_jobs j
   where btrim(j.dispatch_ref) = v_dc.dc_no
     and coalesce(btrim(j.ucn), '') <> '' and j.visit_filed_at is null;
  if v_todo is not null then
    raise exception 'Indoor DC % is not approved: the visit is not yet filed for %', v_dc.dc_no, v_todo
      using errcode = '23514';
  end if;

  update public.indoor_dcs
     set approval_status  = 'Approved',
         approved_by      = auth.uid(),
         approved_at      = now(),
         approved_by_name = coalesce((select coalesce(nullif(btrim(p.full_name), ''), p.email)
                                        from public.profiles p where p.id = auth.uid()), '')
   where id = v_dc.id;
  return v_dc.dc_no;
end $$;
comment on function public.approve_indoor_dc(text, boolean) is
  'Approves an Indoor DC (0323): the AUTHORISED BY person or an administrator; pending only; every job with a UCN must have its visit filed (visit_filed_at); stamps approved_by / approved_at / approved_by_name from the session. p_check_only asks who and state only.';
revoke all on function public.approve_indoor_dc(text, boolean) from public;
do $$ begin
  execute 'revoke all on function public.approve_indoor_dc(text, boolean) from anon';
  execute 'grant execute on function public.approve_indoor_dc(text, boolean) to authenticated';
exception when undefined_object then null; end $$;

create or replace function public.reject_indoor_dc(p_dc_no text, p_reason text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_dc public.indoor_dcs%rowtype;
begin
  select * into v_dc from public.indoor_dcs where dc_no = btrim(p_dc_no) for update;
  if not found then
    raise exception 'Indoor DC % was not found', p_dc_no using errcode = '23503';
  end if;
  if not public.indoor_dc_may_approve(v_dc.authorised_by_name) then
    raise exception 'only % (AUTHORISED BY) or an administrator rejects Indoor DC %', coalesce(nullif(v_dc.authorised_by_name, ''), '(nobody named)'), v_dc.dc_no
      using errcode = '42501';
  end if;
  if v_dc.approval_status <> 'Pending approval' then
    raise exception 'Indoor DC % is %, not pending approval', v_dc.dc_no, v_dc.approval_status
      using errcode = '23514';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'say why Indoor DC % is rejected', v_dc.dc_no using errcode = '23514';
  end if;

  update public.indoor_dcs
     set approval_status = 'Rejected', rejected_by = auth.uid(), rejected_at = now(),
         rejection_reason = btrim(p_reason)
   where id = v_dc.id;

  -- RELEASE THE UNITS, through the guard, on a ticket for this transaction.
  insert into public.indoor_dc_release_tickets (job_id, tx)
  select j.id, txid_current() from public.indoor_jobs j where btrim(j.dispatch_ref) = v_dc.dc_no
  on conflict do nothing;
  update public.indoor_jobs
     set dispatch_ref = '', dc_date = null, dispatched_at = null, dispatched_by = null
   where btrim(dispatch_ref) = v_dc.dc_no;
  delete from public.indoor_dc_release_tickets where tx = txid_current();
  return v_dc.dc_no;
end $$;
comment on function public.reject_indoor_dc(text, text) is
  'Rejects an Indoor DC (0323): the AUTHORISED BY person or an administrator; pending only; a reason; the DC is kept and its units RELEASED (DC No., DC date and dispatch stamps cleared) so a new DC can be made.';
revoke all on function public.reject_indoor_dc(text, text) from public;
do $$ begin
  execute 'revoke all on function public.reject_indoor_dc(text, text) from anon';
  execute 'grant execute on function public.reject_indoor_dc(text, text) to authenticated';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 6. "RETURN TO FIELD" -- the Pending Reason every visit filed from Indoor
--    Service carries (the user, 2026-10-02). Added to the Call Pending Reason
--    master (`pendingreason`, 0021) where it is not there exactly, and made
--    active where it is. Written without the columns later modules add
--    (active: 0066, added_on/by: 0021 -- both in `masters`, which runs AFTER
--    this module on a fresh build), and the active flag set only where it
--    exists.
-- ---------------------------------------------------------------------------
insert into public.masters (name, value)
select 'pendingreason', 'Return to Field'
 where not exists (select 1 from public.masters where name = 'pendingreason' and value = 'Return to Field');
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'masters' and column_name = 'active') then
    execute $q$update public.masters set active = true
                where name = 'pendingreason' and value = 'Return to Field' and active is not true$q$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. THE LISTS -- indoor_job_list rebuilt so `j.*` carries 0323's columns, and
--    the accessories written with their quantity where it is not 1. MIRRORED
--    WORD FOR WORD in 0245 (check:bundles). indoor_dc_list gains the approval
--    (appended), and whether the reader may decide it.
-- ---------------------------------------------------------------------------
drop view if exists public.indoor_job_list;
create view public.indoor_job_list as
  select j.*,
         coalesce(rb.name, '') as received_by_name,
         coalesce(cb.name, '') as cleaned_by_name,
         coalesce(qb.name, '') as qc_by_name,
         coalesce(db.name, '') as dispatched_by_name,
         coalesce(xb.name, '') as condemned_by_name,
         coalesce(ub.name, '') as updated_by_name,
         (j.status in ('Closed', 'Dispatched', 'Condemned')) as is_closed,
         -- A DEMO unit out past its due date, which is the one figure nothing
         -- else in this system produces. NULL rather than false where there is
         -- no due date: "not overdue" and "nobody said when" are different facts.
         (case when j.activity = 'Demo' and j.actual_return is null
                    and j.expected_return is not null
               then (j.expected_return < (now() at time zone 'Asia/Kolkata')::date)
          end) as demo_overdue,
         (select count(*) from public.indoor_job_accessories a where a.job_id = j.id)
           as accessory_count,
         (select count(*) from public.indoor_job_accessories a
           where a.job_id = j.id and not a.returned) as accessories_outstanding,
         coalesce(vb.name, '') as verified_by_name,
         (select string_agg(btrim(a.name) || case when a.qty <> 1 then ' x' || trim_scale(a.qty)::text else '' end,
                            ', ' order by a.id) from public.indoor_job_accessories a
           where a.job_id = j.id and btrim(a.name) <> '') as accessories_received,
         public.indoor_job_is_imported(j.product_name, j.serial) as product_imported,
         coalesce(rpb.name, '') as report_uploaded_by_name
    from public.indoor_jobs j
    left join public.app_user_names rb on rb.id = j.received_by
    left join public.app_user_names cb on cb.id = j.cleaned_by
    left join public.app_user_names qb on qb.id = j.qc_by
    left join public.app_user_names db on db.id = j.dispatched_by
    left join public.app_user_names xb on xb.id = j.condemned_by
    left join public.app_user_names ub on ub.id = j.updated_by
    left join public.app_user_names vb on vb.id = j.verified_by
    left join public.app_user_names rpb on rpb.id = j.report_uploaded_by;
alter view public.indoor_job_list set (security_invoker = on);
grant select on public.indoor_job_list to authenticated;

create or replace view public.indoor_dc_list as
  select d.id, d.dc_no, d.dc_date, d.consignee, d.customer_ref, d.customer_ref_date,
         d.mode_of_despatch, d.purpose, d.issued_by_name, d.created_by, d.created_at,
         (select count(*) from public.indoor_dc_lines l where l.dc_id = d.id) as line_count,
         (select string_agg(j.job_no, ', ' order by l.line_no)
            from public.indoor_dc_lines l join public.indoor_jobs j on j.id = l.job_id
           where l.dc_id = d.id and l.accessory_id is null) as job_nos,
         d.authorised_by_name, d.approval_status, d.approved_by_name, d.approved_at,
         d.rejected_at, d.rejection_reason,
         public.indoor_dc_may_approve(d.authorised_by_name) as i_may_approve
    from public.indoor_dcs d;
alter view public.indoor_dc_list set (security_invoker = on);
grant select on public.indoor_dc_list to authenticated;
