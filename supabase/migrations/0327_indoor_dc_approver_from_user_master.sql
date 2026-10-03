-- ===========================================================================
-- 0327 — THE INDOOR DC IS APPROVED BY WHOEVER THE USER MASTER NAMES, AND THE
-- APPROVAL FILES THE VISIT ITSELF (D-109, D-110, D-108).
--
-- The user, 2026-10-03: "AJAY G (INDOOR) is mapped to VIGNESH and Bagyaraj..
-- but this is not a Hardcodes concept.. it is dynamic based on the user
-- master. So when I say RM / RGM / NSM - it should map as per the user
-- Master". Asked how the NSM is found, as the User Master has no NSM column:
-- "Regional Manager's own manager". Asked whether the person named may see
-- and approve the DC whatever their role holds: "Yes, the mapping decides".
--
-- 1. WHO MAY AUTHORISE (indoor_dc_authorisers). From the ISSUER's User Master
--    row:
--      Reporting Manager  its reporting_manager
--      Regional Manager   its regional_manager
--      NSM                the reporting_manager on the REGIONAL MANAGER's own
--                         User Master row
--    0323 offered every login whose ROLE was nsm, the issuer included, so an
--    NSM could name and approve their own DC (D-110). The issuer is never
--    offered now, whatever the User Master says. A blank name is never a
--    manager (0212's rule): a blank column offers nobody.
--    create_indoor_dc() already refuses an AUTHORISED BY this list does not
--    hold, so the rule reaches the DC without touching that function.
--
-- 2. THE PERSON NAMED SEES WHAT THEY APPROVE. The three read policies asked
--    mod:/indoor alone, which the seeded rm and rgm roles do not hold (D-109):
--    the person the User Master named could not see the DC that named them.
--    Each now also admits the DC's AUTHORISED BY -- the DC, its lines, and the
--    units on it -- and nothing else of Indoor Service.
--
-- 3. APPROVING FILES THE VISIT, IN THE DATABASE. 0323 left the filing to the
--    approver's browser, through the Visit Entry's save path, so it passed
--    only for an approver whose ROLE could file a visit on that call -- an NSM
--    holds no call-report key. approve_indoor_dc() now files, for every unit on
--    the DC with a UCN and no visit filed, exactly what that path files: one
--    visit row (Unsolved / Return to Field / work details Yes, the uploaded
--    Indoor Service Report as the manual report, its number as Manual Report
--    No.) and the drafted spares as consumption, then stamps the unit -- in the
--    SAME transaction as the approval, so a refusal anywhere (the visit-date
--    rule, the hand-stock cap) leaves the DC pending with nothing filed. The
--    visit's own guards still run: this writes as its owner, but every trigger
--    on reports and spare_consumption fires as it does for the screen.
--
-- 4. ONLY THE APPROVAL MARKS A VISIT FILED (D-108). visit_uid and
--    visit_filed_at could be written by the unit's engineer, pointing at an
--    older visit, and the approval then filed nothing. A trigger now refuses a
--    signed-in change to either unless it comes from approve_indoor_dc() or
--    record_indoor_visit() (a transaction-local ticket).
-- ===========================================================================

-- ---- 1. who may authorise ---------------------------------------------------
create or replace function public.indoor_dc_authorisers()
returns table(name text, basis text)
language sql stable security definer set search_path = public as $$
  with me as (
    select lower(btrim(coalesce(p.email, auth.email(), ''))) as em,
           upper(btrim(coalesce(p.full_name, '')))            as full_name
      from (select 1) x left join public.profiles p on p.id = auth.uid()
  ), dir as (
    select d.name, d.reporting_manager, d.regional_manager
      from public.user_directory d, me
     where me.em <> '' and (lower(btrim(coalesce(d.email, ''))) = me.em or lower(btrim(coalesce(d.gmail, ''))) = me.em)
     order by d.validity desc, d.id
     limit 1
  ), rgm_row as (
    -- The REGIONAL MANAGER's own User Master row, by name; its Reporting
    -- Manager is the NSM. A blank Regional Manager finds no row.
    select r.reporting_manager
      from public.user_directory r, dir
     where btrim(coalesce(dir.regional_manager, '')) <> ''
       and upper(btrim(coalesce(r.name, ''))) = upper(btrim(dir.regional_manager))
     order by r.validity desc, r.id
     limit 1
  ), cand as (
    select btrim(coalesce(reporting_manager, '')) as name, 'Reporting Manager'::text as basis, 1 as o from dir
    union all
    select btrim(coalesce(regional_manager, '')), 'Regional Manager', 2 from dir
    union all
    select btrim(coalesce(reporting_manager, '')), 'NSM', 3 from rgm_row
  )
  select c.name, string_agg(c.basis, ' / ' order by c.o) as basis
    from cand c, me
   where c.name <> ''
     -- NEVER THE ISSUER (D-110), by their User Master name or their login's.
     and upper(c.name) <> upper(btrim(coalesce((select d.name from dir d), '')))
     and upper(c.name) <> me.full_name
   group by c.name
   order by min(c.o), c.name;
$$;

-- ---- 2. the person named sees what they approve ----------------------------
-- Asked inside a policy, so they run as the caller and must be executable by
-- a signed-in user; they answer only "is this DC / this unit's DC mine to
-- approve", through indoor_dc_may_approve() (0323).
create or replace function public.indoor_dc_names_me(p_dc_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.indoor_dcs d
                  where d.id = p_dc_id and public.indoor_dc_may_approve(d.authorised_by_name));
$$;
create or replace function public.indoor_job_on_my_dc(p_dispatch_ref text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(btrim(p_dispatch_ref), '') <> ''
     and exists (select 1 from public.indoor_dcs d
                  where d.dc_no = btrim(p_dispatch_ref) and public.indoor_dc_may_approve(d.authorised_by_name));
$$;
revoke execute on function public.indoor_dc_names_me(bigint) from public, anon;
revoke execute on function public.indoor_job_on_my_dc(text) from public, anon;
grant execute on function public.indoor_dc_names_me(bigint) to authenticated;
grant execute on function public.indoor_job_on_my_dc(text) to authenticated;

drop policy if exists indoor_dcs_read on public.indoor_dcs;
create policy indoor_dcs_read on public.indoor_dcs for select
  using ((select public.has_perm('mod:/indoor')) or public.indoor_dc_may_approve(authorised_by_name));

drop policy if exists indoor_dc_lines_read on public.indoor_dc_lines;
create policy indoor_dc_lines_read on public.indoor_dc_lines for select
  using ((select public.has_perm('mod:/indoor')) or public.indoor_dc_names_me(dc_id));

drop policy if exists indoor_read on public.indoor_jobs;
create policy indoor_read on public.indoor_jobs for select
  using ((select public.has_perm('mod:/indoor')) or public.indoor_job_on_my_dc(dispatch_ref));

-- ---- 4. only the approval marks a visit filed (D-108) ----------------------
create or replace function public.indoor_job_visit_by_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.visit_uid is distinct from old.visit_uid or new.visit_filed_at is distinct from old.visit_filed_at)
     and auth.uid() is not null
     and coalesce(current_setting('rithi.indoor_visit', true), '') <> 'on' then
    raise exception 'the visit on job % is recorded by the Indoor DC''s approval, not by an edit', old.job_no
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.indoor_job_visit_by_approval() from public, anon, authenticated;
drop trigger if exists indoor_job_visit_by_approval on public.indoor_jobs;
create trigger indoor_job_visit_by_approval
  before update on public.indoor_jobs
  for each row execute function public.indoor_job_visit_by_approval();

-- record_indoor_visit (0323), unchanged but for the ticket.
create or replace function public.record_indoor_visit(p_job_id bigint, p_visit_uid text, p_complete boolean default false)
returns void language plpgsql security definer set search_path = public as $$
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
  perform set_config('rithi.indoor_visit', 'on', true);
  update public.indoor_jobs
     set visit_uid = nullif(btrim(coalesce(p_visit_uid, '')), ''),
         visit_filed_at = case when p_complete then now() else null end
   where id = p_job_id;
end $$;

-- ---- 3. approving files the visit, in the database -------------------------
-- 0323's approve_indoor_dc, read from the database, with the filing added
-- between the checks and the approval, and the issuer refused (D-110) for a
-- DC raised before this migration that named its own issuer.
create or replace function public.approve_indoor_dc(p_dc_no text, p_check_only boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
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
            'Unsolved', 'Return to Field',
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
end $$;
