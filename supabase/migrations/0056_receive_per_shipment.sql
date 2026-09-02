-- ===========================================================================
-- ACKNOWLEDGE PER SHIPMENT — receipt follows the stock, not the line.
--
-- With partial dispatch (0055) a line can arrive in several deliveries, so
-- "received" stopped being one moment per line. The engineer now acknowledges
-- each SHIPMENT: every spare_dispatch_lines row is stamped when it lands, and
-- the line carries how much has been acknowledged so far (received_qty).
--
-- The line's own received_at is still what marks it Received — it is set only
-- once the WHOLE line has been acknowledged — so spare_line_stage() and
-- deriveStage() are untouched: a line part-delivered stays at Stores (waiting
-- for its balance) and turns Received when the last unit is confirmed.
-- ===========================================================================

alter table public.spare_request_lines
  add column if not exists received_qty numeric not null default 0;

alter table public.spare_dispatch_lines
  add column if not exists received_at     timestamptz,
  add column if not exists received_by     text default '',
  add column if not exists receipt_remarks text default '';

-- History: a line already acknowledged had all of it acknowledged, and its
-- shipments landed with it. Idempotent.
update public.spare_request_lines l
   set received_qty = coalesce(l.qty, 0)
 where l.received_at is not null and coalesce(l.received_qty, 0) = 0;

update public.spare_dispatch_lines d
   set received_at = l.received_at,
       received_by = coalesce(l.received_by, '')
  from public.spare_request_lines l
 where l.id = d.line_id and d.received_at is null and l.received_at is not null;

-- ---------------------------------------------------------------------------
-- Acknowledge every outstanding shipment on these lines. Returns how many
-- shipments were acknowledged. A line whose whole quantity is now confirmed is
-- closed as Received; one still awaiting a balance stays where it is.
-- ---------------------------------------------------------------------------
create or replace function public.receive_spare_shipments(
  p_line_ids bigint[],
  p_actor    text default '',
  p_remarks  text default ''
) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; lid bigint; got numeric;
begin
  if not (public.is_admin() or public.has_perm('spare.receive')) then
    raise exception 'RBAC: acknowledging a receipt requires the spare.receive permission';
  end if;
  if p_line_ids is null or array_length(p_line_ids, 1) is null then
    raise exception 'Nothing to acknowledge: no spares selected';
  end if;

  foreach lid in array p_line_ids loop
    update public.spare_dispatch_lines d
       set received_at     = now(),
           received_by     = coalesce(nullif(btrim(p_actor), ''), ''),
           receipt_remarks = coalesce(p_remarks, '')
     where d.line_id = lid and d.received_at is null;
    get diagnostics got = row_count;
    n := n + got;

    -- how much of this line has now been acknowledged
    select coalesce(sum(d.qty), 0) into got
      from public.spare_dispatch_lines d
     where d.line_id = lid and d.received_at is not null;

    update public.spare_request_lines l
       set received_qty = got,
           -- only a fully acknowledged line becomes Received
           received_at     = case when got >= coalesce(l.qty, 0) then now() else l.received_at end,
           received_by     = case when got >= coalesce(l.qty, 0)
                                  then coalesce(nullif(btrim(p_actor), ''), '') else l.received_by end,
           receipt_remarks = case when got >= coalesce(l.qty, 0)
                                  then coalesce(p_remarks, '') else l.receipt_remarks end
     where l.id = lid;
  end loop;

  return n;
end $$;
grant execute on function public.receive_spare_shipments(bigint[], text, text) to authenticated;
