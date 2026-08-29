-- ===========================================================================
-- Spare approvals move from the REQUEST to the LINE.
--
-- The RM must decide each spare individually — a request for five parts may
-- warrant three of them — so the approval state belongs on spare_request_lines,
-- not on the request header. The later stages (Commercial, NSM, Stores,
-- receipt) also live on the line, which is what lets them be actioned either
-- per spare or, by updating every open line of a request at once, per OR.
--
-- The request header keeps stage/status as a ROLL-UP of its lines, maintained
-- by trigger, so existing reads and filters stay meaningful. Nothing writes
-- those columns directly any more.
-- ===========================================================================

alter table public.spare_request_lines
  add column if not exists rm_by               text,
  add column if not exists rm_at               timestamptz,
  add column if not exists commercial_approval text default 'Pending',
  add column if not exists commercial_by       text,
  add column if not exists commercial_at       timestamptz,
  add column if not exists nsm_approval        text default 'Pending',
  add column if not exists nsm_by              text,
  add column if not exists nsm_at              timestamptz,
  add column if not exists dc_number           text,
  add column if not exists courier             text,
  add column if not exists dispatch_remarks    text,
  add column if not exists dispatched_by       text,
  add column if not exists dispatched_at       timestamptz,
  add column if not exists received_by         text,
  add column if not exists received_at         timestamptz,
  add column if not exists receipt_remarks     text,
  add column if not exists reject_reason       text,
  add column if not exists rejected_stage      text,
  add column if not exists stage               text default 'RM Approval';

-- Everything below writes data. The RBAC guard installed at the end of this
-- migration is dropped first: these are data migrations, not somebody
-- approving spares, and they must not be judged against whoever is running
-- them. In the Supabase SQL Editor auth.uid() is NULL, so is_admin() is false
-- and every stage check would refuse. Recreating the guard at the end also
-- makes this migration safe to re-run.
drop trigger if exists spare_request_lines_guard on public.spare_request_lines;

-- rm_approval / stores_status / status already exist on the line (0001) but
-- were never used; normalise them (and the column defaults) to the header's
-- vocabulary, so new lines need no normalising on a later re-run.
alter table public.spare_request_lines alter column rm_approval   set default 'Pending';
alter table public.spare_request_lines alter column stores_status set default 'Pending';
update public.spare_request_lines set rm_approval   = 'Pending' where coalesce(rm_approval, '') = '';
update public.spare_request_lines set stores_status = 'Pending' where coalesce(stores_status, '') = '';

-- ---------------------------------------------------------------------------
-- Carry each existing request's decisions down onto its lines, so requests
-- already part-way through the chain keep their state.
-- ---------------------------------------------------------------------------
update public.spare_request_lines l
   set rm_approval         = coalesce(nullif(r.rm_approval, ''), l.rm_approval),
       rm_by               = coalesce(l.rm_by, r.rm_by),
       rm_at               = coalesce(l.rm_at, r.rm_at),
       commercial_approval = coalesce(nullif(r.commercial_approval, ''), l.commercial_approval),
       commercial_by       = coalesce(l.commercial_by, r.commercial_by),
       commercial_at       = coalesce(l.commercial_at, r.commercial_at),
       nsm_approval        = coalesce(nullif(r.nsm_approval, ''), l.nsm_approval),
       nsm_by              = coalesce(l.nsm_by, r.nsm_by),
       nsm_at              = coalesce(l.nsm_at, r.nsm_at),
       stores_status       = coalesce(nullif(r.stores_status, ''), l.stores_status),
       dc_number           = coalesce(l.dc_number, r.dc_number),
       courier             = coalesce(l.courier, r.courier),
       dispatch_remarks    = coalesce(l.dispatch_remarks, r.dispatch_remarks),
       dispatched_by       = coalesce(l.dispatched_by, r.dispatched_by),
       dispatched_at       = coalesce(l.dispatched_at, r.dispatched_at),
       received_by         = coalesce(l.received_by, r.received_by),
       received_at         = coalesce(l.received_at, r.received_at),
       receipt_remarks     = coalesce(l.receipt_remarks, r.receipt_remarks),
       reject_reason       = coalesce(l.reject_reason, r.reject_reason),
       rejected_stage      = coalesce(l.rejected_stage, r.rejected_stage),
       stage               = coalesce(nullif(r.stage, ''), l.stage)
  from public.spare_requests r
 where r.uid = l.request_uid
   and l.rm_at is null;   -- only lines never decided on their own

-- ---------------------------------------------------------------------------
-- One line's stage — the same rule the app applies (src/lib/spareflow.ts).
-- ---------------------------------------------------------------------------
create or replace function public.spare_line_stage(
  rm text, commercial text, nsm text, stores text, received timestamptz, item_status text
) returns text language sql immutable as $$
  select case
    when rm ~* 'reject' or commercial ~* 'reject' or nsm ~* 'reject' then 'Rejected'
    when received is not null                                        then 'Received'
    when stores ~* 'dispatch'                                        then 'Dispatched'
    when rm !~* 'approv|auto'                                        then 'RM Approval'
    when public.spare_needs_review(item_status)
     and commercial !~* 'approv|auto'                                then 'Commercial'
    when public.spare_needs_review(item_status)
     and nsm !~* 'approv|auto'                                       then 'NSM'
    else 'Stores'
  end;
$$;
grant execute on function public.spare_line_stage(text, text, text, text, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Keep each line's own stage column current.
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_lines_set_stage()
returns trigger language plpgsql security definer set search_path = public as $$
declare item text;
begin
  select r.item_status into item from public.spare_requests r where r.uid = new.request_uid;
  new.stage := public.spare_line_stage(
    coalesce(new.rm_approval, 'Pending'), coalesce(new.commercial_approval, 'Pending'),
    coalesce(new.nsm_approval, 'Pending'), coalesce(new.stores_status, 'Pending'),
    new.received_at, item);
  new.status := new.stage;
  return new;
end $$;

drop trigger if exists spare_request_lines_set_stage on public.spare_request_lines;
create trigger spare_request_lines_set_stage
  before insert or update on public.spare_request_lines
  for each row execute function public.spare_request_lines_set_stage();

-- ---------------------------------------------------------------------------
-- Roll the lines up onto the request: the least-advanced stage among the lines
-- still alive, or Rejected when every line was rejected.
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_rollup(p_uid text)
returns void language plpgsql security definer set search_path = public as $$
declare roll text;
begin
  select case
           when count(*) = 0                              then 'RM Approval'
           when count(*) filter (where stage <> 'Rejected') = 0 then 'Rejected'
           else min(case stage
                      when 'RM Approval' then 1 when 'Commercial' then 2
                      when 'NSM'         then 3 when 'Stores'     then 4
                      when 'Dispatched'  then 5 when 'Received'   then 6
                    end) filter (where stage <> 'Rejected')::text
         end
    into roll
    from public.spare_request_lines where request_uid = p_uid;

  roll := coalesce(case roll
            when '1' then 'RM Approval' when '2' then 'Commercial'
            when '3' then 'NSM'         when '4' then 'Stores'
            when '5' then 'Dispatched'  when '6' then 'Received'
            else roll end, 'RM Approval');

  -- Written by this function only; the header guard below allows it via a flag.
  perform set_config('app.spare_rollup', '1', true);
  update public.spare_requests
     set stage  = roll,
         status = case when roll = 'Stores' then 'Awaiting Dispatch' else roll end
   where uid = p_uid and (stage is distinct from roll);
  perform set_config('app.spare_rollup', '', true);
end $$;

create or replace function public.spare_request_lines_rollup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.spare_request_rollup(coalesce(new.request_uid, old.request_uid));
  return null;
end $$;

drop trigger if exists spare_request_lines_rollup on public.spare_request_lines;
create trigger spare_request_lines_rollup
  after insert or update or delete on public.spare_request_lines
  for each row execute function public.spare_request_lines_rollup();

-- ---------------------------------------------------------------------------
-- The per-stage guard moves to the line. Same rules as 0012 held on the
-- header: each stage's columns may only change if the actor holds that stage's
-- action; Commercial/NSM auto-approve alongside the RM on a non-AMC item; the
-- receipt needs spare.receive, the raiser, and a dispatched line.
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_lines_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed boolean;
  auto_ok boolean;
  req     public.spare_requests;
begin
  if public.is_admin() then return new; end if;
  select * into req from public.spare_requests where uid = new.request_uid;

  auto_ok := not public.spare_needs_review(req.item_status)
             and public.has_perm('spare.approve_rm');

  changed := new.rm_approval is distinct from old.rm_approval
          or new.rm_by       is distinct from old.rm_by
          or new.rm_at       is distinct from old.rm_at;
  if changed and not public.has_perm('spare.approve_rm') then
    raise exception 'RBAC: RM approval requires the spare.approve_rm permission';
  end if;

  changed := new.commercial_approval is distinct from old.commercial_approval
          or new.commercial_by       is distinct from old.commercial_by
          or new.commercial_at       is distinct from old.commercial_at;
  if changed
     and not public.has_perm('spare.approve_commercial')
     and not (auto_ok and new.commercial_approval = 'Auto-Approved'
              and new.commercial_by is not distinct from old.commercial_by) then
    raise exception 'RBAC: Commercial approval requires the spare.approve_commercial permission';
  end if;

  changed := new.nsm_approval is distinct from old.nsm_approval
          or new.nsm_by       is distinct from old.nsm_by
          or new.nsm_at       is distinct from old.nsm_at;
  if changed
     and not public.has_perm('spare.approve_nsm')
     and not (auto_ok and new.nsm_approval = 'Auto-Approved'
              and new.nsm_by is not distinct from old.nsm_by) then
    raise exception 'RBAC: NSM approval requires the spare.approve_nsm permission';
  end if;

  changed := new.stores_status    is distinct from old.stores_status
          or new.dc_number        is distinct from old.dc_number
          or new.dispatched_by    is distinct from old.dispatched_by
          or new.dispatched_at    is distinct from old.dispatched_at
          or new.courier          is distinct from old.courier
          or new.dispatch_remarks is distinct from old.dispatch_remarks;
  if changed and not public.has_perm('spare.dispatch') then
    raise exception 'RBAC: dispatch / DC requires the spare.dispatch permission';
  end if;

  changed := new.reject_reason  is distinct from old.reject_reason
          or new.rejected_stage is distinct from old.rejected_stage;
  if changed and not public.can_approve_spares() then
    raise exception 'RBAC: recording a rejection requires an approval permission';
  end if;

  changed := new.received_by     is distinct from old.received_by
          or new.received_at     is distinct from old.received_at
          or new.receipt_remarks is distinct from old.receipt_remarks;
  if changed then
    if not public.has_perm('spare.receive') then
      raise exception 'RBAC: acknowledging receipt requires the spare.receive permission';
    end if;
    if not public.is_spare_requester(req) then
      raise exception 'RBAC: only the engineer who raised the request may acknowledge it';
    end if;
    if old.stores_status is null or old.stores_status !~* 'dispatch' then
      raise exception 'RBAC: a spare can only be acknowledged after it is dispatched';
    end if;
  end if;

  -- The part and quantity are the request; they are fixed once submitted.
  if (new.part is distinct from old.part or new.qty is distinct from old.qty)
     and not public.is_spare_requester(req) then
    raise exception 'RBAC: only the engineer who raised the request may change its parts';
  end if;

  return new;
end $$;

drop trigger if exists spare_request_lines_guard on public.spare_request_lines;
create trigger spare_request_lines_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_guard();

-- ---------------------------------------------------------------------------
-- The header no longer carries decisions. Its stage/status change only through
-- the roll-up; its approval columns are legacy and frozen for non-admins.
-- ---------------------------------------------------------------------------
create or replace function public.spare_requests_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if coalesce(current_setting('app.spare_rollup', true), '') = '1' then return new; end if;

  if new.stage  is distinct from old.stage
  or new.status is distinct from old.status
  or new.rm_approval         is distinct from old.rm_approval
  or new.commercial_approval is distinct from old.commercial_approval
  or new.nsm_approval        is distinct from old.nsm_approval
  or new.stores_status       is distinct from old.stores_status
  or new.received_at         is distinct from old.received_at then
    raise exception 'Spare approvals are recorded per spare — update spare_request_lines, not the request';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Approvers already update lines; the raiser must too, to acknowledge receipt.
-- ---------------------------------------------------------------------------
drop policy if exists srl_update on public.spare_request_lines;
create policy srl_update on public.spare_request_lines for update
  using (
    public.can_approve_spares()
    or exists (select 1 from public.spare_requests r
                where r.uid = spare_request_lines.request_uid and public.is_spare_requester(r))
  )
  with check (
    public.can_approve_spares()
    or exists (select 1 from public.spare_requests r
                where r.uid = spare_request_lines.request_uid and public.is_spare_requester(r))
  );

-- Bring every existing request's header into line with its lines.
do $$
declare u text;
begin
  for u in select uid from public.spare_requests loop
    perform public.spare_request_rollup(u);
  end loop;
end $$;
