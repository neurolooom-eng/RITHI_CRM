-- ===========================================================================
-- 0374 — INDOOR SERVICE: "NEW DEVICE" IS ITS OWN KIND.
--
-- The user, 2026-10-04: "Split Demo / New Device -> Demo, New Device as
-- Separate Options", a New Device recorded as "its own kind: New device", its
-- activity fixed to Troubleshooting (as a Field Return), a Demo's to Demo.
--
-- A New device has no customer behind it, so wherever that matters it is
-- treated as a DEMO unit is: create_indoor_dc() sends it to the party it is
-- going to (demo_for_party), never to a party_name it does not have. The
-- Pre-Delivery Testing rule stays the DEMO unit's (the user's rule of
-- 2026-10-02: a DEMO unit of an imported product).
-- ===========================================================================

alter table public.indoor_jobs drop constraint if exists indoor_jobs_kind_check;
alter table public.indoor_jobs add constraint indoor_jobs_kind_check
  check (kind in ('Customer property', 'DEMO unit', 'New device'));

-- create_indoor_dc(), re-stated from the database's current definition
-- (0327's) with its two consignee lines counting a New device as a DEMO unit.
CREATE OR REPLACE FUNCTION public.create_indoor_dc(p_job_ids bigint[], p_consignee text, p_customer_ref text DEFAULT ''::text, p_customer_ref_date date DEFAULT NULL::date, p_mode text DEFAULT ''::text, p_purpose text DEFAULT ''::text, p_line_purposes jsonb DEFAULT '[]'::jsonb, p_authorised_by text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    from (select case when kind in ('DEMO unit', 'New device') then demo_for_party else party_name end as k
            from public.indoor_jobs where id = any (v_ids)) s;
  if (select count(distinct upper(btrim(coalesce(case when kind in ('DEMO unit', 'New device') then demo_for_party
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
end $function$

;
