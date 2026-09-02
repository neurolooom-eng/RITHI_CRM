-- ===========================================================================
-- STOCK OUT — a flat line list, time-to-dispatch, and refurbished parts.
--
-- 1. spare_stock_out_lines: one row per spare actually issued, rather than one
--    card per stock out. It carries the call and the order it came from, and
--    DAYS TO DISPATCH — measured from the moment the spare cleared its LAST
--    approval (NSM where the item needs that review, else Commercial, else RM)
--    to the moment Stores booked it out. That is the interval Stores actually
--    controls; counting from the request would measure the approvers instead.
--
-- 2. Refurbished parts. A recycled spare carries the same description under an
--    R-prefixed part number (ECG-022 -> RECG-022). Stores records the swap as
--    it books the spare out; the DC and the engineer's notification then both
--    say plainly that the part is refurbished.
--
--    NOTE: hand stock continues to key on the REQUESTED part code, so balances
--    and consumption are unaffected by the swap. The refurbished identity is
--    recorded on the issue and shown to the engineer. Tracking R-parts as
--    separate stock lines would be a further change.
-- ===========================================================================

alter table public.spare_dispatch_lines
  add column if not exists refurbished boolean not null default false;

-- ---- the flat list ---------------------------------------------------------
create or replace view public.spare_stock_out_lines as
select
  dl.id                                   as line_id,
  d.uid                                   as stock_out_no,
  coalesce(d.dc_number, '')               as dc_number,
  d.dc_date,
  d.dispatched_at,
  coalesce(d.dispatched_by, '')           as dispatched_by,
  coalesce(d.courier, '')                 as courier,
  coalesce(d.engineer, '')                as engineer,
  lower(btrim(coalesce(d.engineer, '')))  as engineer_key,
  coalesce(d.engineer_email, '')          as engineer_email,
  coalesce(dl.line_uid, '')               as line_uid,
  coalesce(dl.part, '')                   as part,
  public.part_code(dl.part)               as part_code,
  dl.qty,
  dl.refurbished,
  dl.received_at,
  coalesce(r.or_no, '')                   as or_no,
  coalesce(r.req_type, '')                as req_type,
  coalesce(r.item_status, '')             as item_status,
  coalesce(r.ucn, '')                     as ucn,
  coalesce(r.call_number, '')             as call_number,
  coalesce(r.party_name, '')              as party_name,
  coalesce(r.product_name, '')            as product_name,
  coalesce(r.serial, '')                  as serial,
  -- when it cleared its last approval and became Stores' to send
  coalesce(greatest(l.rm_at, l.commercial_at, l.nsm_at), l.created_at, r.created_at)
                                          as approved_at,
  -- and how long Stores then took, in days (one decimal)
  round(
    extract(epoch from (
      d.dispatched_at
      - coalesce(greatest(l.rm_at, l.commercial_at, l.nsm_at), l.created_at, r.created_at)
    ))::numeric / 86400.0, 1)              as days_to_dispatch
from public.spare_dispatch_lines dl
join public.spare_dispatches      d on d.uid = dl.dispatch_uid
join public.spare_request_lines   l on l.id  = dl.line_id
join public.spare_requests        r on r.uid = l.request_uid;

alter view public.spare_stock_out_lines set (security_invoker = on);
grant select on public.spare_stock_out_lines to authenticated;

-- ---- issuing a refurbished part -------------------------------------------
-- p_refurb is parallel to p_line_ids: true issues the recycled equivalent, so
-- the ISSUE records R<code> with the description unchanged. The request itself
-- is untouched — it still says what was asked for.
create or replace function public.refurb_part(p_part text)
returns text language sql immutable as $$
  select case
    when coalesce(btrim(p_part), '') = '' then p_part
    when public.part_code(p_part) like 'R%' then p_part          -- already recycled
    else 'R' || public.part_code(p_part)
         || case when position('|' in p_part) > 0
                 then '|' || split_part(p_part, '|', 2) else '' end
  end;
$$;
grant execute on function public.refurb_part(text) to authenticated;

-- Dispatch, now able to issue a line as its recycled equivalent.
create or replace function public.dispatch_spare_lines(
  p_line_ids bigint[],
  p_qtys     numeric[],
  p_refurb   boolean[],
  p_courier  text default '',
  p_remarks  text default '',
  p_dc_date  date default current_date,
  p_actor    text default ''
) returns public.spare_dispatches
language plpgsql security definer set search_path = public as $$
declare
  eng text; n integer; head public.spare_dispatches; email text;
  i integer; lid bigint; want numeric; rem numeric; send numeric; ref boolean;
  total numeric := 0; cnt integer := 0;
begin
  if not (public.is_admin() or public.has_perm('spare.dispatch')) then
    raise exception 'RBAC: dispatch requires the spare.dispatch permission';
  end if;
  if p_line_ids is null or array_length(p_line_ids, 1) is null then
    raise exception 'Nothing to dispatch: no spares selected';
  end if;

  select count(*), min(v.engineer), min(v.engineer_email) into n, eng, email
    from public.spare_pending_dispatch v where v.line_id = any (p_line_ids);
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
    want := case when p_qtys   is null then null  else p_qtys[i]   end;
    ref  := case when p_refurb is null then false else coalesce(p_refurb[i], false) end;

    select greatest(coalesce(l.qty, 0) - coalesce(l.dispatched_qty, 0), 0)
      into rem from public.spare_request_lines l where l.id = lid;

    send := coalesce(want, rem);
    if send is null or send <= 0 then
      raise exception 'Quantity for spare % must be more than zero', lid;
    end if;
    if send > rem then
      raise exception 'Only % left to send on that spare (you asked for %) — refresh and try again', rem, send;
    end if;

    insert into public.spare_dispatch_lines (dispatch_uid, line_id, line_uid, part, qty, refurbished)
    select head.uid, l.id, coalesce(l.line_uid, ''),
           case when ref then public.refurb_part(l.part) else coalesce(l.part, '') end,
           send, ref
      from public.spare_request_lines l where l.id = lid;

    update public.spare_request_lines l
       set dispatched_qty   = coalesce(l.dispatched_qty, 0) + send,
           courier          = coalesce(p_courier, ''),
           dispatch_remarks = coalesce(p_remarks, ''),
           dispatched_by    = head.dispatched_by,
           dispatched_at    = head.dispatched_at,
           dc_number    = case when coalesce(l.dispatched_qty, 0) + send >= coalesce(l.qty, 0)
                               then head.dc_number else l.dc_number end,
           dispatch_uid = case when coalesce(l.dispatched_qty, 0) + send >= coalesce(l.qty, 0)
                               then head.uid else l.dispatch_uid end,
           stock_out_no = case when coalesce(l.dispatched_qty, 0) + send >= coalesce(l.qty, 0)
                               then head.uid else l.stock_out_no end,
           stores_status = case when coalesce(l.dispatched_qty, 0) + send >= coalesce(l.qty, 0)
                                then 'Dispatched' else l.stores_status end
     where l.id = lid;

    total := total + send; cnt := cnt + 1;
  end loop;

  update public.spare_dispatches d set line_count = cnt, total_qty = total
   where d.uid = head.uid returning * into head;
  return head;
end $$;
grant execute on function public.dispatch_spare_lines(bigint[], numeric[], boolean[], text, text, date, text) to authenticated;

-- Older signatures keep working: no refurbishment.
create or replace function public.dispatch_spare_lines(
  p_line_ids bigint[], p_qtys numeric[],
  p_courier text default '', p_remarks text default '',
  p_dc_date date default current_date, p_actor text default ''
) returns public.spare_dispatches
language sql security definer set search_path = public as $$
  select public.dispatch_spare_lines(p_line_ids, p_qtys, null::boolean[], p_courier, p_remarks, p_dc_date, p_actor);
$$;

-- The engineer is told when what is coming is a refurbished part.
create or replace function public.notify_spare_dispatched()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid; r record; refurb_note text := '';
begin
  if coalesce(new.stores_status, '') !~* 'dispatch' then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.stores_status, '') ~* 'dispatch' then return new; end if;
  select sr.engineer, sr.engineer_email, sr.ucn, sr.party_name into r
    from public.spare_requests sr where sr.uid = new.request_uid;
  v_uid := public.notify_resolve_uid(r.engineer_email, r.engineer);
  if v_uid is null then return new; end if;

  if exists (select 1 from public.spare_dispatch_lines d
              where d.line_id = new.id and d.refurbished) then
    refurb_note := ' · REFURBISHED part';
  end if;

  insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
  values (v_uid, coalesce(r.engineer_email, ''), 'spare_dispatched',
          case when refurb_note <> '' then 'Spare dispatched (refurbished)' else 'Spare dispatched' end,
          concat_ws(' · ', nullif(coalesce(new.part, ''), ''), nullif(coalesce(r.ucn, ''), ''),
                    nullif(coalesce(r.party_name, ''), '')) || refurb_note,
          '/spare-requests');
  return new;
end $$;
