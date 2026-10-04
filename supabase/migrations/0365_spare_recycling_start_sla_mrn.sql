-- ===========================================================================
-- 0365 — SPARE RECYCLING: START WORK AND ITS SLA, ONE REQUEST PER SPARE, AND
--        IMPORT FROM MRN.
--
-- The user, 2026-10-04:
--   * "I should be able to Track my Work in Spare Recycling, I need Provision
--     to Mark - Start Work - With Date & Time. SLA starts only when i click on
--     Start Work. SLA is 3 Working Days. Saturday, Sunday Holiday, But make it
--     configurable through SLA Page."
--   * "If Qty is more than 1, it should get created as Separate requests."
--   * "I should have the Provision to Import spares from MRN as well." --
--     both the good and the defective quantity, and a line may be imported
--     any number of times (no link is kept; the MRN No is recorded as text).
--
-- STILL A PARALLEL TRACK, STILL NON-AUDITABLE: everything below refuses while
-- Audit Mode is on, and the MRN read is READ-ONLY on material_returns.
-- ===========================================================================

alter table public.recycle_requests add column if not exists work_started_at      timestamptz;
alter table public.recycle_requests add column if not exists work_started_by      uuid;
alter table public.recycle_requests add column if not exists work_started_by_name text not null default '';
alter table public.recycle_requests add column if not exists mrn_ref              text not null default '';

-- ---------------------------------------------------------------------------
-- 1. THE SLA SETTINGS -- the recycling track's OWN, kept apart from the call
--    SLA rules so they can never change how a call is judged. In app_settings,
--    changed only through set_recycle_sla() and read through
--    recycle_sla_settings().
--      recycle_sla_working_days  how many working days from Start Work (3)
--      recycle_sla_weekend_days  the days that are not working days, as
--                                day-of-week numbers, 0 = Sunday .. 6 = Saturday
--                                ('0,6' = Saturday and Sunday)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.app_settings') is not null then
    insert into public.app_settings (key, value) values
      ('recycle_sla_working_days', '3'),
      ('recycle_sla_weekend_days', '0,6')
    on conflict (key) do nothing;
  end if;
end $$;

create or replace function public.recycle_sla_settings()
returns table (working_days integer, weekend_days integer[])
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(value), '')::int from public.app_settings where key = 'recycle_sla_working_days'), 3),
         coalesce((select array(select nullif(btrim(x), '')::int
                                  from unnest(string_to_array(value, ',')) x where btrim(x) <> '')
                     from public.app_settings where key = 'recycle_sla_weekend_days'), array[0, 6]);
$$;
revoke execute on function public.recycle_sla_settings() from public, anon;
grant execute on function public.recycle_sla_settings() to authenticated;

create or replace function public.set_recycle_sla(p_working_days integer, p_weekend_days integer[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.audit_mode(), false) then
    raise exception 'Spare Recycling is not available while Audit Mode is on.';
  end if;
  if not (coalesce(public.is_admin(), false) or coalesce(public.has_perm('config.manage'), false)) then
    raise exception 'RBAC: changing the SLA needs "Admin config"';
  end if;
  if p_working_days is null or p_working_days < 1 or p_working_days > 60 then
    raise exception 'The SLA must be between 1 and 60 working days.';
  end if;
  if exists (select 1 from unnest(coalesce(p_weekend_days, '{}')) d where d < 0 or d > 6) then
    raise exception 'Holidays are days of the week, 0 (Sunday) to 6 (Saturday).';
  end if;
  if coalesce(array_length(p_weekend_days, 1), 0) >= 7 then
    raise exception 'At least one day of the week must be a working day.';
  end if;
  insert into public.app_settings (key, value) values
    ('recycle_sla_working_days', p_working_days::text),
    ('recycle_sla_weekend_days', coalesce(array_to_string(
       array(select distinct d from unnest(p_weekend_days) d order by d), ','), ''))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
revoke execute on function public.set_recycle_sla(integer, integer[]) from public, anon;
grant execute on function public.set_recycle_sla(integer, integer[]) to authenticated;

-- WHEN THE SLA FALLS DUE: the start plus N working days, the clock time kept,
-- skipping every day of the week marked as a holiday -- counted in India time,
-- because "a working day" is a day in Chennai, not in UTC.
create or replace function public.recycle_sla_due(p_start timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  s     record;
  d     timestamp;
  n     integer := 0;
  guard integer := 0;
begin
  if p_start is null then return null; end if;
  select * into s from public.recycle_sla_settings();
  d := p_start at time zone 'Asia/Kolkata';
  while n < s.working_days and guard < 400 loop
    d := d + interval '1 day';
    guard := guard + 1;
    if not (extract(dow from d)::int = any (coalesce(s.weekend_days, '{}'))) then
      n := n + 1;
    end if;
  end loop;
  return d at time zone 'Asia/Kolkata';
end $$;
revoke execute on function public.recycle_sla_due(timestamptz) from public, anon;
grant execute on function public.recycle_sla_due(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. START WORK -- once, on an open request, at a time not in the future.
--    The only way the work_started_* columns are written: the guard keeps the
--    old values on every other update.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, because it stamps the starter's name (recycle_me_name(),
-- closed to the API); the key and Audit Mode are asked first, below.
create or replace function public.start_recycle_work(p_id bigint, p_at timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  r public.recycle_requests;
  t timestamptz := coalesce(p_at, now());
begin
  if not coalesce(public.recycle_may('recycle.close'), false)
     and not coalesce(public.recycle_may('recycle.register'), false) then
    raise exception 'RBAC: starting work on a recycling request needs "Consume, add costs and close" or "Register"';
  end if;
  select * into r from public.recycle_requests where id = p_id;
  if not found then raise exception 'No such recycling request.'; end if;
  if r.status <> 'Open' then raise exception '% is closed.', r.rcy_no; end if;
  if r.work_started_at is not null then
    raise exception 'Work on % was already started on %.', r.rcy_no,
      to_char(r.work_started_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI');
  end if;
  if t > now() + interval '5 minutes' then raise exception 'Start Work cannot be in the future.'; end if;
  if t < r.created_at - interval '1 minute' then
    raise exception 'Start Work cannot be before % was registered.', r.rcy_no;
  end if;
  perform set_config('rithi.recycle_start', 'on', true);
  update public.recycle_requests
     set work_started_at = t, work_started_by = auth.uid(), work_started_by_name = public.recycle_me_name()
   where id = p_id;
  perform set_config('rithi.recycle_start', '', true);
  return t;
end $$;
revoke execute on function public.start_recycle_work(bigint, timestamptz) from public, anon;
grant execute on function public.start_recycle_work(bigint, timestamptz) to authenticated;

-- The guard, re-stated whole from 0355 with three additions: the Start Work
-- columns are written only by start_recycle_work(); a NEW request is ONE
-- spare (qty 1); and mrn_ref is kept as typed.
create or replace function public.recycle_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.rcy_no := public.recycle_next_no('RCY', 'public.recycle_requests', 'rcy_no');
    new.created_by := auth.uid();
    new.created_by_name := public.recycle_me_name();
    new.status := 'Open';
    new.returned_part_code := ''; new.returned_qty := null; new.returned_on := null;
    new.closed_at := null; new.closed_by := null; new.closed_by_name := '';
    new.work_started_at := null; new.work_started_by := null; new.work_started_by_name := '';
    new.part_code := btrim(new.part_code);
    if new.part_code = '' then raise exception 'Part code is required.'; end if;
    -- ONE REQUEST PER SPARE (the user, 2026-10-04): register_recycle_requests()
    -- makes N requests for a quantity of N.
    if new.qty <> 1 then
      raise exception 'A recycling request is one spare. Register a quantity of % as % requests.', new.qty, new.qty;
    end if;
    return new;
  end if;

  -- UPDATE
  new.rcy_no := old.rcy_no; new.created_by := old.created_by;
  new.created_by_name := old.created_by_name; new.created_at := old.created_at;
  new.updated_at := now();
  if coalesce(current_setting('rithi.recycle_start', true), '') <> 'on' then
    new.work_started_at := old.work_started_at; new.work_started_by := old.work_started_by;
    new.work_started_by_name := old.work_started_by_name;
  end if;
  if old.status <> 'Open' then
    raise exception 'Recycling request % is closed (%) and cannot be changed.', old.rcy_no, old.status;
  end if;
  if new.status = 'Open' then
    new.returned_part_code := ''; new.returned_qty := null; new.returned_on := null;
    new.closed_at := null; new.closed_by := null; new.closed_by_name := '';
    return new;
  end if;

  -- CLOSING
  if not coalesce(public.has_perm('recycle.close'), false) then
    raise exception 'RBAC: closing a recycling request needs "Consume, add costs and close a recycling request"';
  end if;
  if btrim(coalesce(new.job_done, '')) = '' then
    raise exception 'Record the job done before closing %.', old.rcy_no;
  end if;
  new.closed_at := now();
  new.closed_by := auth.uid();
  new.closed_by_name := public.recycle_me_name();
  if new.status = 'Returned' then
    new.returned_part_code := 'R' || old.part_code;
    new.returned_qty := coalesce(new.returned_qty, old.qty);
    new.returned_on := coalesce(new.returned_on, (now() at time zone 'Asia/Kolkata')::date);
    new.not_recyclable_reason := '';
  else
    if btrim(coalesce(new.not_recyclable_reason, '')) = '' then
      raise exception 'Say why % is not recyclable.', old.rcy_no;
    end if;
    new.returned_part_code := ''; new.returned_qty := null; new.returned_on := null;
  end if;
  return new;
end $$;
revoke execute on function public.recycle_requests_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. REGISTER N SPARES AS N REQUESTS, in one transaction: all numbered, or
--    none. Runs as the CALLER, so the insert policy (recycle.register, not in
--    Audit Mode) decides.
-- ---------------------------------------------------------------------------
create or replace function public.register_recycle_requests(
  p_part_code text, p_part_description text, p_serial text, p_qty integer,
  p_received_on date, p_received_from text, p_call_ref text, p_remarks text, p_mrn_ref text default '')
returns text[] language plpgsql security invoker set search_path = public as $$
declare
  nos text[] := '{}';
  no  text;
  i   integer;
begin
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1.'; end if;
  if p_qty > 200 then raise exception 'Register at most 200 spares at a time.'; end if;
  -- A serial belongs to ONE spare: with more than one, each request gets its
  -- own serial afterwards.
  if p_qty > 1 and btrim(coalesce(p_serial, '')) <> '' then
    raise exception 'A serial belongs to one spare. Leave it blank for a quantity of %, and enter each serial on its own request.', p_qty;
  end if;
  for i in 1..p_qty loop
    insert into public.recycle_requests
      (part_code, part_description, serial, qty, received_on, received_from, call_ref, remarks, mrn_ref)
    values (p_part_code, coalesce(p_part_description, ''), coalesce(p_serial, ''), 1,
            coalesce(p_received_on, (now() at time zone 'Asia/Kolkata')::date),
            coalesce(p_received_from, ''), coalesce(p_call_ref, ''), coalesce(p_remarks, ''), coalesce(p_mrn_ref, ''))
    returning rcy_no into no;
    nos := nos || no;
  end loop;
  return nos;
end $$;
revoke execute on function public.register_recycle_requests(text, text, text, integer, date, text, text, text, text) from public, anon;
grant execute on function public.register_recycle_requests(text, text, text, integer, date, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE MRN LINES TO IMPORT FROM -- READ-ONLY on the regular material_returns,
--    every line with a good or defective quantity, for a holder of
--    recycle.register while Audit Mode is off. A definer function, because
--    material_returns' own read policy narrows a non-office reader to their
--    own and their team's returns, and the recycling user imports from all of
--    them. Nothing here writes to material_returns.
-- ---------------------------------------------------------------------------
create or replace function public.recycle_mrn_lines(p_search text default '', p_limit integer default 300)
returns table (id bigint, mrn_no text, mrn_date date, engineer text, item_code text, item_name text,
               part text, good_qty numeric, defective_qty numeric, customer_name text, report_no text,
               removed_from_equipment text, remarks text)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := lower(btrim(coalesce(p_search, '')));
begin
  if not coalesce(public.recycle_may('recycle.register'), false) then
    raise exception 'RBAC: importing from MRN needs "Register a defective spare for recycling" (and Audit Mode off)';
  end if;
  return query
    select m.id, m.mrn_no, m.mrn_date, m.engineer, m.item_code, m.item_name, m.part,
           coalesce(m.good_qty, 0), coalesce(m.defective_qty, 0), m.customer_name, m.report_no,
           m.removed_from_equipment, m.remarks
      from public.material_returns m
     where (coalesce(m.good_qty, 0) > 0 or coalesce(m.defective_qty, 0) > 0)
       and (q = '' or lower(concat_ws(' ', m.mrn_no, m.engineer, m.item_code, m.item_name, m.part, m.customer_name)) like '%' || q || '%')
     order by m.mrn_date desc nulls last, m.id desc
     limit greatest(1, least(coalesce(p_limit, 300), 1000));
end $$;
revoke execute on function public.recycle_mrn_lines(text, integer) from public, anon;
grant execute on function public.recycle_mrn_lines(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. THE REQUEST LIST, WITH THE SLA. Re-created with its columns NAMED; the
--    new ones at the END (create or replace can only append).
-- ---------------------------------------------------------------------------
create or replace view public.recycle_request_list as
select r.id, r.rcy_no, r.received_on, r.part_code, r.part_description, r.serial, r.qty,
       r.received_from, r.call_ref, r.remarks, r.job_done, r.status,
       r.returned_part_code, r.returned_qty, r.returned_on, r.not_recyclable_reason,
       r.closed_at, r.closed_by, r.closed_by_name, r.created_at, r.created_by, r.created_by_name,
       r.updated_at,
       coalesce(pc.parts_cost, 0) as parts_cost,
       coalesce(oc.other_cost, 0) as other_cost,
       coalesce(pc.parts_cost, 0) + coalesce(oc.other_cost, 0) as total_cost,
       coalesce(ic.issued_cost, 0) as issued_cost,
       -- ---- 0365 ------------------------------------------------------------
       r.work_started_at, r.work_started_by_name, r.mrn_ref,
       sla.due_at as sla_due_at,
       case
         when r.work_started_at is null then 'Not started'
         when r.status <> 'Open' then case when r.closed_at <= sla.due_at then 'Met' else 'Breached' end
         when now() > sla.due_at then 'Breached'
         when (now() at time zone 'Asia/Kolkata')::date = (sla.due_at at time zone 'Asia/Kolkata')::date then 'Due today'
         else 'On track'
       end as sla_status
  from public.recycle_requests r
  left join lateral (select sum(v.value) as parts_cost from public.recycle_consumption_list v where v.request_id = r.id) pc on true
  left join lateral (select sum(o.amount) as other_cost from public.recycle_other_costs o where o.request_id = r.id) oc on true
  left join lateral (select sum(x.cost_issued) as issued_cost from public.recycle_mrs_list x where x.request_id = r.id) ic on true
  left join lateral (select public.recycle_sla_due(r.work_started_at) as due_at) sla on true;
alter view public.recycle_request_list set (security_invoker = on);
grant select on public.recycle_request_list to authenticated;
