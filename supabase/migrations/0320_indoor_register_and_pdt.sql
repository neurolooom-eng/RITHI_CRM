-- ===========================================================================
-- 0320 — THE INDOOR REGISTER CARRIES R/SER/07, AND A DEMO UNIT OF AN IMPORTED
--        PRODUCT CARRIES R/SER/QC/007
--
-- The user, 2026-10-02, with photographs of the two controlled paper records
-- the Indoor Service process keeps: "Compare what is there and tell me the
-- process / conception gap and implement process so that it is in line with
-- these records."
--
-- RECORD 1 -- R/SER/07 INDOOR SERVICE EQUIPMENT FAILURE REGISTER, two sheets
-- ("CUSTOMER - DEVICE's" and "DEMO"). Its columns the register did not hold:
--   Field Service Report No   field_report_no
--   Engineer Name             engineer_name   (DEMO: "Indoor Service")
--   Customer Place            customer_place
--   Problem Reported          problem_reported
--   Status (the COVER)        cover           WGP / OGP / CMC / AMC, read from
--                                             the machine by the screen and
--                                             editable (the user's decision 1)
--   Indoor Service Report No  indoor_report_no
--   DC No./Date               dispatch_ref (exists) + dc_date
--   Remarks                   remarks         free text (decision 2)
--   Verified By               verified_by / verified_at (decision 3)
-- `status` stays the WORKFLOW stage and `condition_on_arrival` stays what it
-- is: the paper's "Status" column is the cover, which is why it is a new
-- column and not a second meaning of an old one.
--
-- VERIFIED BY is a supervisor's verification of the COMPLETED row, so it is
-- its own key, `indoor.verify`, asked by the guard below; it is allowed only
-- once the job is Dispatched, Closed or Condemned; and who and when are
-- STAMPED from the session -- whatever the browser sends is discarded, the
-- rule every other stamp here keeps. The key is GRANTED TO NOBODY by this file
-- (the user's standing rule: Roles & Permissions is the administrator's). An
-- administrator passes has_perm() anyway.
--
-- RECORD 2 -- R/SER/QC/007 PRE DELIVERY TESTING (Quality Control), structured
-- in `indoor_pdt`, one row per job. It is OWED only by a DEMO unit whose
-- product line is IMPORTED (the user: "Pre-delivery check is done only for
-- Imported products, not for in-house manufactured equipment"):
--   * indoor_job_is_imported() answers from the Product Master (0319);
--   * UNKNOWN -- the product matches no line, or the line's `imported` is
--     blank -- does NOT require the test for dispatch (the user's decision),
--     and the screen says the answer is unknown so somebody fills the master;
--   * when it IS owed, the unit cannot move to Dispatched or Closed until the
--     test is COMPLETE (every field filled, inspector signed) and checks 1-5
--     all read OK. A NOT OK refuses -- "a machine cannot leave with a failed
--     check", the rule 0158 already keeps for the quality check.
-- Customer-property jobs keep the existing quality check unchanged.
--
-- The guard is 0297's body WORD FOR WORD with the new rules added after it;
-- every rule it carried is still here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE REGISTER'S COLUMNS
-- ---------------------------------------------------------------------------
alter table public.indoor_jobs
  add column if not exists field_report_no  text not null default '',
  add column if not exists engineer_name    text not null default '',
  add column if not exists customer_place   text not null default '',
  add column if not exists problem_reported text not null default '',
  add column if not exists indoor_report_no text not null default '',
  add column if not exists dc_date          date,
  add column if not exists remarks          text not null default '',
  add column if not exists cover            text not null default '',
  add column if not exists verified_by      uuid,
  add column if not exists verified_at      timestamptz;

comment on column public.indoor_jobs.cover is
  'R/SER/07 "Status": the machine''s COVER (WGP / OGP / CMC / AMC, cover_code()), read from the Product Database when the job is received or its product/serial changes, and editable. Not the workflow stage, which is `status`.';
comment on column public.indoor_jobs.verified_by is
  'R/SER/07 "Verified By": stamped from the session by indoor_jobs_guard() (0320) for a holder of indoor.verify, once the job is Dispatched, Closed or Condemned. A value the browser sends is discarded.';

-- ---------------------------------------------------------------------------
-- 2. IS THIS JOB'S PRODUCT IMPORTED? true / false / NULL (= not known)
--
-- THE MAPPING IS THE ONE THIS PROJECT ALREADY USES, in this order:
--   a. THE MACHINE'S OWN CODE. A job names model and serial; the Product
--      Database holds one machine per model+serial (`machine_key`, unique,
--      0079) and that machine's product code (`item_code`, 0194, whose comment
--      says it "joins this machine to its line on public.product_master").
--      Exact, and the only way to tell CPX CARE's nine codes apart.
--   b. THE NAME, as product_line_sellable() (0193) falls back to it:
--      upper(btrim()) equality on product_master.product_name. A name can have
--      several codes, so it answers only where EVERY code of that name gives
--      the same, non-blank answer; codes that disagree, or one left blank, is
--      UNKNOWN rather than a guess.
-- NULL means unknown, and the dispatch rule treats unknown as not owing the
-- test (the user's decision) while the screen says so.
--
-- PL/pgSQL and checked at RUN time on purpose: this module runs BEFORE the
-- masters module in ALL_ORDER, so `product_master.imported` (0319) does not
-- exist yet when this file is applied to an empty database. A function that
-- named it at creation would stop the bundle; this one answers NULL until the
-- column is there.
--
-- SECURITY DEFINER so the screen (through indoor_job_list) and the guard read
-- the same machine whatever the reader's Product Database visibility is -- an
-- answer that changed with who asked would be a dispatch rule that changed
-- with who asked. It returns one boolean about a product line, and the
-- Product Master is readable by every signed-in user anyway (pm_read).
-- ---------------------------------------------------------------------------
create or replace function public.indoor_job_is_imported(p_product_name text, p_serial text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_code text;
  v_ans  boolean;
  v_n    integer;
  v_set  integer;
  v_true integer;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'product_master'
                    and column_name = 'imported') then
    return null;
  end if;

  -- a. the machine's own code
  if coalesce(btrim(p_product_name), '') <> '' and coalesce(btrim(p_serial), '') <> ''
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'products'
                    and column_name = 'item_code') then
    select nullif(btrim(p.item_code), '') into v_code
      from public.products p
     where p.machine_key = lower(btrim(p_product_name)) || '|' || lower(btrim(p_serial))
     limit 1;
    if v_code is not null then
      select count(*) into v_n
        from public.product_master pm
       where upper(btrim(pm.product_code)) = upper(v_code);
      if v_n = 1 then
        select pm.imported into v_ans from public.product_master pm
         where upper(btrim(pm.product_code)) = upper(v_code);
        return v_ans;
      end if;
    end if;
  end if;

  -- b. the name, only where every code of it agrees
  if coalesce(btrim(p_product_name), '') = '' then return null; end if;
  select count(*), count(pm.imported), count(*) filter (where pm.imported)
    into v_n, v_set, v_true
    from public.product_master pm
   where upper(btrim(pm.product_name)) = upper(btrim(p_product_name));
  if v_n = 0 or v_set < v_n then return null; end if;   -- no line, or one left blank
  if v_true = v_n then return true; end if;
  if v_true = 0 then return false; end if;
  return null;                                           -- the codes disagree
end $$;

comment on function public.indoor_job_is_imported(text, text) is
  'Is the product of an indoor job IMPORTED? true / false / NULL = unknown. The machine''s own code (Product Database, model+serial -> item_code -> product_master) first; else the product NAME, answering only where every code of that name agrees and none is blank (0320). Decides whether a DEMO unit owes Pre-Delivery Testing R/SER/QC/007; unknown does not.';

revoke all on function public.indoor_job_is_imported(text, text) from public;
do $$ begin
  execute 'revoke all on function public.indoor_job_is_imported(text, text) from anon';
  execute 'grant execute on function public.indoor_job_is_imported(text, text) to authenticated';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. R/SER/QC/007 PRE DELIVERY TESTING -- one row per job.
--
-- The form's own fields, in its own words. "HV" and "HT" are kept as the
-- paper prints them and NOT interpreted: text, because nobody has said what
-- they measure or in what unit. The two mode tables are the measured values
-- at FiO2 21 / 60 / 100 %; the SET values (V=500 ml, RR=12 bpm ...) are
-- printed on the form and are not data.
--
-- Check 6 on the paper -- "Only use the Accessories associated with the
-- respective machine." -- is an instruction, not a check, and has no column.
-- ---------------------------------------------------------------------------
create table if not exists public.indoor_pdt (
  id        bigint generated always as identity primary key,
  job_id    bigint not null unique references public.indoor_jobs (id) on delete cascade,

  test_date              date,
  measuring_equipment_id text not null default '',
  software_version       text not null default '',
  hv                     text not null default '',
  ht                     text not null default '',

  check1 text check (check1 in ('OK', 'NOT OK')),
  check2 text check (check2 in ('OK', 'NOT OK')),
  check3 text check (check3 in ('OK', 'NOT OK')),
  check4 text check (check4 in ('OK', 'NOT OK')),
  check5 text check (check5 in ('OK', 'NOT OK')),

  -- 7. Mode CMV/ACMV -- Volume (Vte), Peep, O2% at FiO2 21 / 60 / 100 %
  cmv_vte_21  numeric, cmv_vte_60  numeric, cmv_vte_100  numeric,
  cmv_peep_21 numeric, cmv_peep_60 numeric, cmv_peep_100 numeric,
  cmv_o2_21   numeric, cmv_o2_60   numeric, cmv_o2_100   numeric,
  -- 8. Mode PCMV -- PIP, Peep, O2% at FiO2 21 / 60 / 100 %
  pcmv_pip_21  numeric, pcmv_pip_60  numeric, pcmv_pip_100  numeric,
  pcmv_peep_21 numeric, pcmv_peep_60 numeric, pcmv_peep_100 numeric,
  pcmv_o2_21   numeric, pcmv_o2_60   numeric, pcmv_o2_100   numeric,

  -- Inspected by: stamped from the session at signing, with the name and the
  -- designation the person held THEN (User Master via profiles, 0199).
  inspected_by          uuid,
  inspector_name        text not null default '',
  inspector_designation text not null default '',
  inspected_at          timestamptz,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.indoor_pdt is
  'R/SER/QC/007 PRE DELIVERY TESTING, one row per indoor job (0320). Owed by a DEMO unit whose product line is imported (indoor_job_is_imported): such a unit is not Dispatched or Closed until every field here is filled, the inspector has signed, and checks 1-5 all read OK.';

-- WHO SIGNED IS THE SESSION'S, like every stamp in this module. Setting
-- inspected_by (to anything) is the act of signing: the trigger replaces it
-- with auth.uid() and fills the name, designation and time from the profile.
-- Clearing it withdraws the signature. Any other change to the four columns is
-- discarded.
create or replace function public.indoor_pdt_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sign boolean;
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    v_sign := new.inspected_by is not null;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.job_id     := old.job_id;
    v_sign := new.inspected_by is distinct from old.inspected_by and new.inspected_by is not null;
    if new.inspected_by is null and old.inspected_by is not null then
      new.inspector_name := ''; new.inspector_designation := ''; new.inspected_at := null;
      return new;
    end if;
    if not v_sign then
      new.inspected_by          := old.inspected_by;
      new.inspector_name        := old.inspector_name;
      new.inspector_designation := old.inspector_designation;
      new.inspected_at          := old.inspected_at;
      return new;
    end if;
  end if;

  if v_sign then
    new.inspected_by := auth.uid();
    new.inspected_at := case when auth.uid() is null then null else now() end;
    select coalesce(nullif(btrim(p.full_name), ''), p.email, ''), coalesce(btrim(p.designation), '')
      into new.inspector_name, new.inspector_designation
      from public.profiles p where p.id = auth.uid();
    new.inspector_name        := coalesce(new.inspector_name, '');
    new.inspector_designation := coalesce(new.inspector_designation, '');
  else
    new.inspected_by := null; new.inspected_at := null;
    new.inspector_name := ''; new.inspector_designation := '';
  end if;
  return new;
end $$;
drop trigger if exists zz_indoor_pdt_stamp on public.indoor_pdt;
create trigger zz_indoor_pdt_stamp before insert or update on public.indoor_pdt
  for each row execute function public.indoor_pdt_stamp();

-- The audience of indoor_job_checks (0158): reading is the module key, writing
-- indoor.work or indoor.receive. NO DELETE policy and no DELETE grant: this is
-- a quality record (0049's rule), corrected by a further edit, never removed.
alter table public.indoor_pdt enable row level security;
drop policy if exists indoor_pdt_read on public.indoor_pdt;
create policy indoor_pdt_read on public.indoor_pdt for select
  using ((select public.has_perm('mod:/indoor')));
drop policy if exists indoor_pdt_insert on public.indoor_pdt;
create policy indoor_pdt_insert on public.indoor_pdt for insert
  with check ((select public.has_perm('indoor.work')) or (select public.has_perm('indoor.receive')));
drop policy if exists indoor_pdt_update on public.indoor_pdt;
create policy indoor_pdt_update on public.indoor_pdt for update
  using ((select public.has_perm('indoor.work')) or (select public.has_perm('indoor.receive')))
  with check ((select public.has_perm('indoor.work')) or (select public.has_perm('indoor.receive')));
grant select, insert, update on public.indoor_pdt to authenticated;

-- The five system columns, now where the module that adds them already ran
-- (on a fresh build sys_columns runs later and attaches it itself).
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.indoor_pdt'::regclass);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. THE GUARD -- 0297 verbatim, then the three new rules.
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
         and not public.has_perm('indoor.dispatch') then
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

  return new;
end $function$;

-- ---------------------------------------------------------------------------
-- 5. THE LIST -- 0158's view, with the verifier's name, the accessories as the
--    register writes them, and whether the product is imported. `j.*` picks up
--    the new columns. MIRRORED WORD FOR WORD in 0245 (check:bundles).
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
         (select string_agg(btrim(a.name), ', ' order by a.id) from public.indoor_job_accessories a
           where a.job_id = j.id and btrim(a.name) <> '') as accessories_received,
         public.indoor_job_is_imported(j.product_name, j.serial) as product_imported
    from public.indoor_jobs j
    left join public.app_user_names rb on rb.id = j.received_by
    left join public.app_user_names cb on cb.id = j.cleaned_by
    left join public.app_user_names qb on qb.id = j.qc_by
    left join public.app_user_names db on db.id = j.dispatched_by
    left join public.app_user_names xb on xb.id = j.condemned_by
    left join public.app_user_names ub on ub.id = j.updated_by
    left join public.app_user_names vb on vb.id = j.verified_by;
alter view public.indoor_job_list set (security_invoker = on);
grant select on public.indoor_job_list to authenticated;
