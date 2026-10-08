-- ===========================================================================
-- WHERE DID A DISPATCHED REQUEST LINE GO IN HAND STOCK? (2026-10-08).
-- READ-ONLY. One grid.
--
-- A historical stock out (spare_issue_history) whose line_uid is a live
-- request line marked dispatched is NOT counted from history: the live line is
-- counted instead (handstock_movements' two Stores DC arms). That live
-- movement is booked against the REQUEST's engineer and part, at the line's
-- dispatch date -- which need not be the history row's. This shows, for one
-- line, the history row, the live line and request, its dispatch records, and
-- every movement the view makes of it, with the engineer and part each lands
-- on. Change the line on the `ask` line.
-- ===========================================================================
with ask as (select 'OR42974|ESA-009'::text as line_uid),
l as (
  select l.*, r.or_no, r.engineer as req_engineer, r.engineer_email as req_email, r.ucn as req_ucn,
         r.dispatched_at as req_dispatched_at, r.created_at as req_created_at, r.uid as req_uid
    from public.spare_request_lines l
    join public.spare_requests r on r.uid = l.request_uid, ask
   where lower(btrim(l.line_uid)) = lower(btrim(ask.line_uid))
)
select 1 as row, 'history row' as what,
       h.engineer || ' -> key ' || h.engineer_key || ' | part ' || h.part_code || ' | qty ' || h.qty
         || ' | ' || coalesce(h.so_no, '') || ' | ' || to_char(coalesce(h.issued_at, h.created_at) at time zone 'Asia/Kolkata', 'DD-Mon-YY HH24:MI') as detail
  from public.spare_issue_history h, ask
 where lower(btrim(h.line_uid)) = lower(btrim(ask.line_uid))
union all
select 2, 'live request line',
       'OR ' || coalesce(l.or_no, '') || ' | request engineer ' || coalesce(l.req_engineer, '') || ' -> key ' || public.handstock_key(l.req_engineer)
       || ' | part ' || coalesce(l.part, '') || ' -> code ' || public.part_code(l.part)
       || ' | qty ' || coalesce(l.qty, 0) || ' | dispatched_qty ' || coalesce(l.dispatched_qty, 0)
       || ' | stores_status ' || coalesce(l.stores_status, '') || ' | dc ' || coalesce(l.dc_number, '')
       || ' | line dispatched_at ' || coalesce(to_char(l.dispatched_at at time zone 'Asia/Kolkata', 'DD-Mon-YY HH24:MI'), '-')
       || ' | request dispatched_at ' || coalesce(to_char(l.req_dispatched_at at time zone 'Asia/Kolkata', 'DD-Mon-YY HH24:MI'), '-')
       || ' | line created ' || coalesce(to_char(l.created_at at time zone 'Asia/Kolkata', 'DD-Mon-YY HH24:MI'), '-')
       || ' | UCN ' || coalesce(l.req_ucn, '')
  from l
union all
select 3, 'dispatch record',
       'DC ' || coalesce(d.dc_number, '') || ' | qty ' || coalesce(dl.qty, 0) || ' | '
       || coalesce(to_char(d.dispatched_at at time zone 'Asia/Kolkata', 'DD-Mon-YY HH24:MI'), '-')
  from l join public.spare_dispatch_lines dl on dl.line_id = l.id
  join public.spare_dispatches d on d.uid = dl.dispatch_uid
union all
select 4, 'movement made of it',
       m.movement || ' ' || m.qty || ' | engineer ' || m.engineer || ' -> key ' || m.engineer_key
       || ' | part ' || m.part_code || ' | ' || m.ref_type || ' ' || m.ref
       || ' | ' || coalesce(to_char(m.moved_at at time zone 'Asia/Kolkata', 'DD-Mon-YY HH24:MI'), '-')
  from l join public.handstock_movements m on m.ref_uid = l.req_uid and m.movement = 'Stock out'
                                          and m.part_code = public.part_code(l.part)
order by 1;
