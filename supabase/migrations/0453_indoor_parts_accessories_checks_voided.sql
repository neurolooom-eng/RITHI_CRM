-- ===========================================================================
-- 0453 — A HARVESTED PART, AN ACCESSORY AND A CHECK ARE VOIDED, NOT DELETED
--        (second re-review D-039, FRS-143.8)
--
-- The parts, accessories and checks under an indoor job were FOR ALL policies
-- with DELETE granted (0158), and the screen offered Remove on each, so a
-- harvested part or a recorded check verdict could be erased. 0445 images the
-- delete; FRS-143.8 asks for more: they "shall not be deletable through the
-- application; an entry made in error shall be marked void with the reason,
-- the person and the time retained".
--
--   * each table gains voided_at / voided_by / void_reason;
--   * a signed-in DELETE is refused -- "void it instead";
--   * setting voided_at needs a reason, and the person and the time are the
--     database's (from the session), whatever was sent; a voided row cannot be
--     changed again; a row cannot be inserted already voided;
--   * a voided accessory does not travel on a new Indoor DC (create_indoor_dc,
--     0374's body plus that one condition) and is left out of the indoor list's
--     accessory count, outstanding count and received list (indoor_job_list,
--     0323's definition plus the same condition -- and 0245, its mirror, with it).
-- Not stopped: delete_indoor_job() (an owner's function that removes a whole
-- job made in error with everything under it, 0336), a connection with no
-- session, and a repair in the SQL editor.
-- In the indoor module, last.
-- ===========================================================================

do $cols$
declare t text;
begin
  foreach t in array array['indoor_job_parts', 'indoor_job_accessories', 'indoor_job_checks'] loop
    execute format('alter table public.%I add column if not exists voided_at timestamptz', t);
    execute format('alter table public.%I add column if not exists voided_by uuid', t);
    execute format('alter table public.%I add column if not exists void_reason text not null default %L', t, '');
  end loop;
end $cols$;

create or replace function public.indoor_child_kept()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return old; end if;
  if current_user <> 'authenticated' then return old; end if;
  raise exception '% is kept -- void it with a reason instead',
    case tg_table_name when 'indoor_job_parts' then 'A harvested part'
                       when 'indoor_job_accessories' then 'An accessory'
                       else 'A check' end
    using errcode = '23514';
end $$;
revoke execute on function public.indoor_child_kept() from public, anon, authenticated;

create or replace function public.indoor_child_void_stamp()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    new.voided_at := null; new.voided_by := null; new.void_reason := '';
    return new;
  end if;
  if old.voided_at is not null then
    raise exception 'This entry was voided on % and is kept as it was', to_char(old.voided_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI')
      using errcode = '23514';
  end if;
  if new.voided_at is null then
    new.voided_by := null; new.void_reason := '';
    return new;
  end if;
  if btrim(coalesce(new.void_reason, '')) = '' then
    raise exception 'Give the reason for voiding this entry' using errcode = '23514';
  end if;
  new.voided_at := now(); new.voided_by := auth.uid(); new.void_reason := btrim(new.void_reason);
  return new;
end $$;
revoke execute on function public.indoor_child_void_stamp() from public, anon, authenticated;

do $trg$
declare t text;
begin
  foreach t in array array['indoor_job_parts', 'indoor_job_accessories', 'indoor_job_checks'] loop
    execute format('drop trigger if exists indoor_child_kept on public.%I', t);
    execute format('create trigger indoor_child_kept before delete on public.%I for each row execute function public.indoor_child_kept()', t);
    execute format('drop trigger if exists zzx_indoor_child_void_stamp on public.%I', t);
    execute format('create trigger zzx_indoor_child_void_stamp before insert or update on public.%I for each row execute function public.indoor_child_void_stamp()', t);
  end loop;
end $trg$;

-- ---- the Indoor DC leaves a voided accessory behind (0374's body, read from the
-- database there, + one condition -- 0374 is the current definition, and its
-- New device rule must survive) ----
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
         and voided_at is null   -- 0453 (D-039): a voided accessory does not travel
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
end $function$;

-- ---- the list counts only what is not voided (0323 + the same condition) ----
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
         (select count(*) from public.indoor_job_accessories a where a.job_id = j.id and a.voided_at is null)
           as accessory_count,
         (select count(*) from public.indoor_job_accessories a
           where a.job_id = j.id and not a.returned and a.voided_at is null) as accessories_outstanding,
         coalesce(vb.name, '') as verified_by_name,
         (select string_agg(btrim(a.name) || case when a.qty <> 1 then ' x' || trim_scale(a.qty)::text else '' end,
                            ', ' order by a.id) from public.indoor_job_accessories a
           where a.job_id = j.id and btrim(a.name) <> '' and a.voided_at is null) as accessories_received,
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
