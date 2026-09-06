-- ===========================================================================
-- Spare_1.sql must leave every object it defines at its LATEST definition.
--
-- Proven by applying every migration to one database, replaying the bundle on
-- a copy and diffing: without this file, running Spare_1.sql on its own put
-- 0027's `dispatch_spare_lines()` and `sd_read` back — a dispatch that cannot
-- book a refurbished part or a partial line, and a per-row policy check where
-- 0095 made it an InitPlan. No error, and the bundle reports success.
--
-- Both are owned by `handstock`, which runs AFTER this module in ALL_ORDER, so
-- a fresh apply is unaffected: the blocks below are guarded on tables handstock
-- creates, skip while they are absent, and handstock defines them identically a
-- moment later. On a replay against a live database everything is present.
--
-- The definitions here are COPIES. `npm run check:bundles` compares them with
-- the owning migration word for word and fails if either side moves, which is
-- the only thing keeping a copy a copy — see MIRRORS in check-bundles.mjs.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- dispatch_spare_lines() — 0065_refurb_stock_and_part_master
-- --------------------------------------------------------------------------
do $mirror$
begin
  if to_regclass('public.spare_dispatch_lines') is null then
    raise notice 'skip dispatch_spare_lines — public.spare_dispatch_lines is not present yet';
    return;
  end if;
  execute $body$
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
  $body$;
  grant execute on function public.dispatch_spare_lines(bigint[], numeric[], boolean[], text, text, date, text) to authenticated;
end $mirror$;

-- --------------------------------------------------------------------------
-- dispatch_spare_lines(bigint[], text, text, date, text) — 0055_partial_dispatch
--
-- The five-argument OVERLOAD. 0027 defines it as the whole implementation;
-- 0055 split partial dispatch out into a six-argument version and left this
-- one as a thin wrapper that calls it. Replaying Spare_1.sql put 0027's
-- implementation back under this signature, so a caller on the old shape wrote
-- dispatches that knew nothing about partial quantities or refurbished parts.
-- --------------------------------------------------------------------------
do $mirror$
begin
  if to_regprocedure('public.dispatch_spare_lines(bigint[],numeric[],text,text,date,text)') is null then
    raise notice 'skip dispatch_spare_lines/5 — the six-argument version it calls is not present yet';
    return;
  end if;
  execute $body$
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
  $body$;
  grant execute on function public.dispatch_spare_lines(bigint[], text, text, date, text) to authenticated;
end $mirror$;

-- --------------------------------------------------------------------------
-- sd_read — 0095_rls_initplans
-- --------------------------------------------------------------------------
do $mirror$
begin
  if to_regclass('public.spare_dispatches') is null
     or to_regproc('public.can_view_all_calls') is null then
    raise notice 'skip sd_read — spare_dispatches or can_view_all_calls() is not present yet';
    return;
  end if;
  drop policy if exists sd_read on public.spare_dispatches;
  create policy sd_read on public.spare_dispatches for select
    using (
      (select public.is_admin())
      or created_by = (select auth.uid())
      or (select public.has_perm('spare.dispatch'))
      or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n))
    );
end $mirror$;
