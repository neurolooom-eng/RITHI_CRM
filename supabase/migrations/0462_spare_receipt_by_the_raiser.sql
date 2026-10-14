-- ===========================================================================
-- D-174 (re-review 5, 2026-10-12): a shipment is acknowledged by the engineer
-- who raised the request, under the session's own name.
--
-- receive_spare_shipments() is SECURITY DEFINER and asked only spare.receive.
-- It updated spare_dispatch_lines by line id with no requester check, and on a
-- PARTIAL shipment it leaves the request line's received_* columns alone -- so
-- the requester rule in spare_request_lines_guard, which fires on those
-- columns, never ran. The receiver's name was the caller's p_actor. Measured:
-- an engineer holding spare.receive who could not even see the line
-- acknowledged its shipment as "The Real Engineer".
--
-- Now, for every line asked about, the function applies the line guard's own
-- receipt rule before it writes anything: the caller is the raiser
-- (is_spare_requester) or an administrator, and a shipment of the line exists
-- (a partial dispatch leaves the line's status at Pending, so the status is not
-- the test).
-- A signed-in caller's name is the session's (my_display_name(), as 0393 does
-- for the request lines); p_actor is used only with nobody signed in (an owner
-- run). Restated from 0056 (the latest definition); the arithmetic is unchanged.
-- ===========================================================================
create or replace function public.receive_spare_shipments(p_line_ids bigint[], p_actor text default '', p_remarks text default '')
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; lid bigint; got numeric; v_name text; r public.spare_requests;
begin
  if not (public.is_admin() or public.has_perm('spare.receive')) then
    raise exception 'RBAC: acknowledging a receipt requires the spare.receive permission';
  end if;
  if p_line_ids is null or array_length(p_line_ids, 1) is null then
    raise exception 'Nothing to acknowledge: no spares selected';
  end if;
  v_name := case when auth.uid() is not null then coalesce(nullif(btrim(public.my_display_name()), ''), btrim(coalesce(p_actor, '')))
                 else btrim(coalesce(p_actor, '')) end;

  -- 0462: the receipt rule of spare_request_lines_guard, for every line,
  -- before anything is written.
  foreach lid in array p_line_ids loop
    select q.* into r
      from public.spare_request_lines l join public.spare_requests q on q.uid = l.request_uid
     where l.id = lid;
    if not found then
      raise exception 'Spare line % does not exist', lid;
    end if;
    if auth.uid() is not null and not public.is_admin() and not coalesce(public.is_spare_requester(r), false) then
      raise exception 'RBAC: only the engineer who raised the request may acknowledge it (line %)', lid;
    end if;
    -- A shipment is the proof of dispatch: a PARTIAL dispatch leaves the line's
    -- stores_status at Pending, so the status cannot be the test here.
    if not exists (select 1 from public.spare_dispatch_lines d where d.line_id = lid) then
      raise exception 'RBAC: a spare can only be acknowledged after it is dispatched (line %)', lid;
    end if;
  end loop;

  foreach lid in array p_line_ids loop
    update public.spare_dispatch_lines d
       set received_at     = now(),
           received_by     = v_name,
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
           received_by     = case when got >= coalesce(l.qty, 0) then v_name else l.received_by end,
           receipt_remarks = case when got >= coalesce(l.qty, 0)
                                  then coalesce(p_remarks, '') else l.receipt_remarks end
     where l.id = lid;
  end loop;

  return n;
end $$;
