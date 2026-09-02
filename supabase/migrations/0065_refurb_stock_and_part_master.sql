-- ===========================================================================
-- A refurbished spare is tracked under its own part number, and the swap is
-- only allowed for a part that exists in Part Master and is ACTIVE.
--
-- 1. Hand stock now counts what was ISSUED (spare_dispatch_lines) rather than
--    what was requested, so a spare issued as RECG-022 appears in the
--    engineer's stock as RECG-022 and is consumed as RECG-022. A legacy arm
--    keeps any line marked Dispatched without issue rows (an import) in the
--    ledger, so no stock is lost.
--
-- 2. The R-part must be a real, active part. Stores cannot invent stock by
--    ticking Refurb: if R<code> is not in Part Master, or is inactive, the
--    dispatch is refused and names the code that is missing.
-- ===========================================================================

create or replace view public.handstock_movements as
-- 1. Stock out from Stores (+) — from the ISSUE, so what the engineer holds is
--    the part that actually arrived. A refurbished spare is issued under its own
--    R-prefixed code and therefore appears as its own stock line.
select
  'IN'::text                                        as direction,
  'Stock out'::text                                 as movement,
  public.handstock_key(r.engineer)                  as engineer_key,
  coalesce(r.engineer, '')                          as engineer,
  coalesce(r.engineer_email, '')                    as engineer_email,
  public.part_code(dl.part)                         as part_code,
  coalesce(dl.part, '')                             as part,
  coalesce(dl.qty, 0)                               as qty,
  coalesce(d.dispatched_at, dl.created_at)          as moved_at,
  coalesce(nullif(d.dc_number, ''), r.or_no, '')    as ref,
  'Stores DC'::text                                 as ref_type,
  coalesce(r.uid, '')                               as ref_uid,
  coalesce(r.ucn, '')                               as ucn,
  coalesce(r.call_number, '')                       as call_number,
  coalesce(r.party_name, '')                        as party_name,
  coalesce(nullif(l.dispatch_remarks, ''), '')      as remarks
from public.spare_dispatch_lines dl
join public.spare_dispatches    d on d.uid = dl.dispatch_uid
join public.spare_request_lines l on l.id  = dl.line_id
join public.spare_requests      r on r.uid = l.request_uid
union all
-- 1b. Legacy safety net: a line marked Dispatched that has no issue rows (an
--     import, or a write that bypassed dispatch_spare_lines). Without this the
--     ledger would silently lose that stock.
select
  'IN'::text, 'Stock out'::text,
  public.handstock_key(r.engineer), coalesce(r.engineer, ''), coalesce(r.engineer_email, ''),
  public.part_code(l.part), coalesce(l.part, ''),
  case when coalesce(l.dispatched_qty, 0) > 0 then l.dispatched_qty else coalesce(l.qty, 0) end,
  coalesce(l.dispatched_at, r.dispatched_at, l.created_at, r.created_at),
  coalesce(nullif(l.dc_number, ''), r.or_no, ''),
  'Stores DC'::text, coalesce(r.uid, ''), coalesce(r.ucn, ''), coalesce(r.call_number, ''),
  coalesce(r.party_name, ''), coalesce(nullif(l.dispatch_remarks, ''), '')
from public.spare_request_lines l
join public.spare_requests r on r.uid = l.request_uid
where (coalesce(l.dispatched_qty, 0) > 0 or coalesce(l.stores_status, '') ~* 'dispatch')
  and not exists (select 1 from public.spare_dispatch_lines dl where dl.line_id = l.id)
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

-- ---- the R-part must exist and be active ----------------------------------
create or replace function public.refurb_part_ok(p_part text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.parts p
     where upper(btrim(p.code)) = public.part_code(p_part)
       and coalesce(p.active, true)
  );
$$;
grant execute on function public.refurb_part_ok(text) to authenticated;

-- ---- dispatch refuses an unknown or inactive refurbished part -------------
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

    -- A refurbished issue may only use a part that Part Master actually knows
    -- and still lists as active — otherwise ticking Refurb would invent a part
    -- number, and with it a stock line nobody can order against.
    if ref then
      declare rp text;
      begin
        select public.refurb_part(l.part) into rp from public.spare_request_lines l where l.id = lid;
        if not public.refurb_part_ok(rp) then
          raise exception 'Refurbished part % is not in Part Master, or is not active — add it before issuing it',
            public.part_code(rp);
        end if;
      end;
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
