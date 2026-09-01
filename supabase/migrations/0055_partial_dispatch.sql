-- ===========================================================================
-- PARTIAL DISPATCH — Stores can send fewer units than were requested.
--
-- Before: a spare line was dispatched whole. If an engineer asked for 2 and
-- Stores had 1, the only options were to send nothing or to pretend 2 went out.
--
-- Now: each stock out records HOW MANY of each line it carried. A line keeps
-- its requested qty (the request of record is never rewritten); what has gone
-- out accumulates in spare_request_lines.dispatched_qty, and the line stays in
-- the Stores queue for the REMAINDER until it is fully sent.
--
--   requested 2, dispatched 1  ->  queue shows 1 still to send
--   requested 2, dispatched 2  ->  line leaves the queue (as before)
--
-- A line can now belong to several stock outs, which a single dispatch_uid
-- column cannot express, so the per-dispatch quantities live in their own
-- table (spare_dispatch_lines) — that is what a DC prints. Existing dispatches
-- are back-filled into it, so history and hand stock stay uniform: there is no
-- "old way" left to special-case.
-- ===========================================================================

-- ---- 1. what has gone out, per line ---------------------------------------
alter table public.spare_request_lines
  add column if not exists dispatched_qty numeric not null default 0;

-- ---- 2. what each stock out carried ---------------------------------------
create table if not exists public.spare_dispatch_lines (
  id           bigint generated always as identity primary key,
  dispatch_uid text   not null,                       -- spare_dispatches.uid (SO-…)
  line_id      bigint not null references public.spare_request_lines (id) on delete cascade,
  line_uid     text   default '',
  part         text   default '',
  qty          numeric not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists spare_dispatch_lines_dispatch_idx on public.spare_dispatch_lines (dispatch_uid);
create index if not exists spare_dispatch_lines_line_idx     on public.spare_dispatch_lines (line_id);

alter table public.spare_dispatch_lines enable row level security;
grant select on public.spare_dispatch_lines to authenticated;
-- Read is open to signed-in users; every screen reaches these rows through a
-- join to spare_request_lines / spare_requests, whose own RLS does the scoping.
drop policy if exists sdl_read on public.spare_dispatch_lines;
create policy sdl_read on public.spare_dispatch_lines for select
  using (auth.role() = 'authenticated');
-- Written only by dispatch_spare_lines() (security definer); a direct write
-- still needs the dispatch permission.
drop policy if exists sdl_write on public.spare_dispatch_lines;
create policy sdl_write on public.spare_dispatch_lines for all
  using (public.has_perm('spare.dispatch')) with check (public.has_perm('spare.dispatch'));

-- ---- 3. back-fill history: every already-dispatched line sent its full qty --
update public.spare_request_lines l
   set dispatched_qty = coalesce(l.qty, 0)
 where coalesce(l.dispatched_qty, 0) = 0
   and coalesce(l.stores_status, '') ~* 'dispatch';

insert into public.spare_dispatch_lines (dispatch_uid, line_id, line_uid, part, qty)
select l.dispatch_uid, l.id, coalesce(l.line_uid, ''), coalesce(l.part, ''), coalesce(l.qty, 0)
  from public.spare_request_lines l
 where coalesce(l.dispatch_uid, '') <> ''
   and not exists (select 1 from public.spare_dispatch_lines d where d.line_id = l.id);


-- ---- 4. hand stock counts what was DISPATCHED, not what was asked for ----
create or replace view public.handstock_movements as
-- 1. Stock out from Stores (+)
select
  'IN'::text                                        as direction,
  'Stock out'::text                                 as movement,
  public.handstock_key(r.engineer)                  as engineer_key,
  coalesce(r.engineer, '')                          as engineer,
  coalesce(r.engineer_email, '')                    as engineer_email,
  public.part_code(l.part)                          as part_code,
  coalesce(l.part, '')                              as part,
  -- what actually went out: the recorded dispatched qty when there is one,
  -- else the line's qty (a line marked Dispatched by an import or an older
  -- path sent all of it) — so no stock is ever lost from the ledger.
  case when coalesce(l.dispatched_qty, 0) > 0
       then l.dispatched_qty else coalesce(l.qty, 0) end   as qty,
  coalesce(l.dispatched_at, r.dispatched_at, l.created_at, r.created_at)
                                                    as moved_at,
  coalesce(nullif(l.dc_number, ''), r.or_no, '')    as ref,
  'Stores DC'::text                                 as ref_type,
  coalesce(r.uid, '')                               as ref_uid,
  coalesce(r.ucn, '')                               as ucn,
  coalesce(r.call_number, '')                       as call_number,
  coalesce(r.party_name, '')                        as party_name,
  coalesce(nullif(l.dispatch_remarks, ''), '')      as remarks
from public.spare_request_lines l
join public.spare_requests r on r.uid = l.request_uid
where coalesce(l.dispatched_qty, 0) > 0
   or coalesce(l.stores_status, '') ~* 'dispatch'
union all
-- 2. Consumption on a call (−)
select
  'OUT'::text, 'Consumption'::text,
  public.handstock_key(c.engineer),
  coalesce(c.engineer, ''),
  coalesce(c.engineer_email, ''),
  public.part_code(c.part),
  coalesce(c.part, ''),
  coalesce(c.qty, 0),
  c.created_at,
  coalesce(nullif(btrim(c.call_number), ''), coalesce(c.ucn, '')),
  'Call'::text,
  ''::text,
  coalesce(c.ucn, ''),
  coalesce(c.call_number, ''),
  ''::text,
  ''::text
from public.spare_consumption c
union all
-- 3. Stock transfer FROM this engineer (−)
select
  'OUT'::text, 'Transfer out'::text,
  public.handstock_key(t.from_engineer),
  coalesce(t.from_engineer, ''),
  ''::text,
  public.part_code(l.part),
  coalesce(l.part, ''),
  coalesce(l.qty, 0),
  coalesce(t.transfer_date::timestamptz, t.created_at),
  coalesce(t.uid, ''),
  'Transfer'::text,
  ''::text,
  ''::text,
  ''::text,
  coalesce(t.to_engineer, ''),                      -- who it went to
  coalesce(t.remarks, '')
from public.stock_transfer_lines l
join public.stock_transfers t on t.uid = l.transfer_uid
union all
-- 4. Stock transfer TO this engineer (+)
select
  'IN'::text, 'Transfer in'::text,
  public.handstock_key(t.to_engineer),
  coalesce(t.to_engineer, ''),
  ''::text,
  public.part_code(l.part),
  coalesce(l.part, ''),
  coalesce(l.qty, 0),
  coalesce(t.transfer_date::timestamptz, t.created_at),
  coalesce(t.uid, ''),
  'Transfer'::text,
  ''::text,
  ''::text,
  ''::text,
  coalesce(t.from_engineer, ''),                    -- who it came from
  coalesce(t.remarks, '')
from public.stock_transfer_lines l
join public.stock_transfers t on t.uid = l.transfer_uid
union all
-- 5. Returned to Stores on an MRN (−)
select
  'OUT'::text, 'Return'::text,
  public.handstock_key(m.engineer),
  coalesce(m.engineer, ''),
  coalesce(m.engineer_email, ''),
  public.part_code(m.part),
  coalesce(m.part, ''),
  coalesce(m.good_qty, 0) + coalesce(m.defective_qty, 0),
  coalesce(m.mrn_date::timestamptz, m.returned_at, m.created_at),
  coalesce(nullif(btrim(m.mrn_no), ''), m.uid, ''),
  'MRN'::text,
  coalesce(m.uid, ''),
  ''::text,
  coalesce(m.report_no, ''),
  coalesce(m.customer_name, ''),
  btrim(
    case when coalesce(m.defective_qty, 0) > 0
         then 'good ' || coalesce(m.good_qty, 0) || ', defective ' || m.defective_qty || ' · ' else '' end
    || coalesce(m.remarks, '')
  )
from public.material_returns m;

alter view public.handstock_movements set (security_invoker = on);
grant select on public.handstock_movements to authenticated;

-- ---- 5. the queue shows the REMAINDER --------------------------------------
create or replace view public.spare_pending_dispatch as
select
  l.id                                        as line_id,
  l.line_uid,
  l.request_uid,
  r.or_no,
  r.or_req_date,
  l.row_no,
  l.part,
  upper(btrim(split_part(coalesce(l.part, ''), '|', 1)))
                                              as part_code,
  -- `qty` is what is STILL to send, so every consumer (queue totals, KPI
  -- tiles, the digest) counts outstanding units, not the original ask.
  greatest(coalesce(l.qty, 0) - coalesce(l.dispatched_qty, 0), 0) as qty,
  r.req_type,
  r.item_status,
  coalesce(r.engineer, '')                    as engineer,
  lower(btrim(coalesce(r.engineer, '')))      as engineer_key,
  coalesce(r.engineer_email, '')              as engineer_email,
  coalesce(r.ucn, '')                         as ucn,
  coalesce(r.call_number, '')                 as call_number,
  coalesce(r.party_name, '')                  as party_name,
  coalesce(r.product_name, '')                as product_name,
  coalesce(r.serial, '')                      as serial,
  coalesce(r.handstock_reason, '')            as handstock_reason,
  coalesce(r.remarks, '')                     as remarks,
  l.rm_by, l.rm_at, l.commercial_by, l.commercial_at, l.nsm_by, l.nsm_at,
  coalesce(l.created_at, r.created_at)        as raised_at,
  greatest(coalesce(l.nsm_at, l.commercial_at, l.rm_at, l.created_at, r.created_at),
           coalesce(l.created_at, r.created_at))                       as waiting_since,
  coalesce(l.qty, 0)                          as requested_qty,
  coalesce(l.dispatched_qty, 0)               as dispatched_qty
from public.spare_request_lines l
join public.spare_requests r on r.uid = l.request_uid
-- Computed, not read: the stage column is a cache and may be stale.
where public.spare_line_stage(
        coalesce(l.rm_approval, 'Pending'),
        coalesce(l.commercial_approval, 'Pending'),
        coalesce(l.nsm_approval, 'Pending'),
        coalesce(l.stores_status, 'Pending'),
        l.received_at,
        r.item_status) = 'Stores'
  and coalesce(l.dispatch_uid, '') = ''
  -- a partly-sent line stays queued for its remainder; a fully sent one leaves
  and (coalesce(l.qty, 0) - coalesce(l.dispatched_qty, 0)) > 0;

alter view public.spare_pending_dispatch set (security_invoker = on);
grant select on public.spare_pending_dispatch to authenticated;

-- ---- 6. dispatch, with a quantity per line ---------------------------------
-- p_qtys is parallel to p_line_ids: how many units of that line this stock out
-- carries. NULL (or a null element) means "all that is left". A quantity above
-- the remainder is rejected rather than silently clamped — Stores should see
-- that the queue moved under them.
create or replace function public.dispatch_spare_lines(
  p_line_ids bigint[],
  p_qtys     numeric[],
  p_courier  text default '',
  p_remarks  text default '',
  p_dc_date  date default current_date,
  p_actor    text default ''
) returns public.spare_dispatches
language plpgsql security definer set search_path = public as $$
declare
  eng   text;
  n     integer;
  head  public.spare_dispatches;
  email text;
  i     integer;
  lid   bigint;
  want  numeric;
  rem   numeric;
  send  numeric;
  total numeric := 0;
  cnt   integer := 0;
begin
  if not (public.is_admin() or public.has_perm('spare.dispatch')) then
    raise exception 'RBAC: dispatch requires the spare.dispatch permission';
  end if;
  if p_line_ids is null or array_length(p_line_ids, 1) is null then
    raise exception 'Nothing to dispatch: no spares selected';
  end if;

  select count(*), min(v.engineer), min(v.engineer_email)
    into n, eng, email
    from public.spare_pending_dispatch v
   where v.line_id = any (p_line_ids);
  if coalesce(n, 0) <> array_length(p_line_ids, 1) then
    raise exception
      'Only % of the % selected spares are still waiting at Stores — refresh and try again',
      coalesce(n, 0), array_length(p_line_ids, 1);
  end if;
  if (select count(distinct v.engineer_key) from public.spare_pending_dispatch v
       where v.line_id = any (p_line_ids)) <> 1 then
    raise exception 'A stock out goes to one engineer — select spares for a single engineer';
  end if;

  insert into public.spare_dispatches
    (dc_date, engineer, engineer_email, courier, remarks, line_count, total_qty, dispatched_by)
  values
    (coalesce(p_dc_date, current_date), eng, coalesce(email, ''), coalesce(p_courier, ''),
     coalesce(p_remarks, ''), 0, 0, coalesce(nullif(btrim(p_actor), ''), ''))
  returning * into head;

  for i in 1 .. array_length(p_line_ids, 1) loop
    lid  := p_line_ids[i];
    want := case when p_qtys is null then null else p_qtys[i] end;

    select greatest(coalesce(l.qty, 0) - coalesce(l.dispatched_qty, 0), 0)
      into rem from public.spare_request_lines l where l.id = lid;

    send := coalesce(want, rem);
    if send is null or send <= 0 then
      raise exception 'Quantity for spare % must be more than zero', lid;
    end if;
    if send > rem then
      raise exception 'Only % left to send on that spare (you asked for %) — refresh and try again', rem, send;
    end if;

    insert into public.spare_dispatch_lines (dispatch_uid, line_id, line_uid, part, qty)
    select head.uid, l.id, coalesce(l.line_uid, ''), coalesce(l.part, ''), send
      from public.spare_request_lines l where l.id = lid;

    update public.spare_request_lines l
       set dispatched_qty   = coalesce(l.dispatched_qty, 0) + send,
           courier          = coalesce(p_courier, ''),
           dispatch_remarks = coalesce(p_remarks, ''),
           dispatched_by    = head.dispatched_by,
           dispatched_at    = head.dispatched_at,
           -- Fully sent: stamp the stock out and close the line, exactly as
           -- before. Partly sent: leave dispatch_uid / stores_status alone so
           -- the line stays at Stores for its remainder.
           dc_number    = case when coalesce(l.dispatched_qty, 0) + send >= coalesce(l.qty, 0)
                               then head.dc_number else l.dc_number end,
           dispatch_uid = case when coalesce(l.dispatched_qty, 0) + send >= coalesce(l.qty, 0)
                               then head.uid else l.dispatch_uid end,
           stock_out_no = case when coalesce(l.dispatched_qty, 0) + send >= coalesce(l.qty, 0)
                               then head.uid else l.stock_out_no end,
           stores_status = case when coalesce(l.dispatched_qty, 0) + send >= coalesce(l.qty, 0)
                                then 'Dispatched' else l.stores_status end
     where l.id = lid;

    total := total + send;
    cnt   := cnt + 1;
  end loop;

  update public.spare_dispatches d
     set line_count = cnt, total_qty = total
   where d.uid = head.uid
   returning * into head;

  return head;
end $$;
grant execute on function public.dispatch_spare_lines(bigint[], numeric[], text, text, date, text) to authenticated;

-- The original signature still works and means "send everything that is left".
create or replace function public.dispatch_spare_lines(
  p_line_ids bigint[],
  p_courier  text default '',
  p_remarks  text default '',
  p_dc_date  date default current_date,
  p_actor    text default ''
) returns public.spare_dispatches
language sql security definer set search_path = public as $$
  select public.dispatch_spare_lines(p_line_ids, null::numeric[], p_courier, p_remarks, p_dc_date, p_actor);
$$;
grant execute on function public.dispatch_spare_lines(bigint[], text, text, date, text) to authenticated;
