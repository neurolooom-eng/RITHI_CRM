-- ===========================================================================
-- WHICH SPARES ARE WAITING AT COMMERCIAL THAT DO NOT NEED COMMERCIAL? -- one
-- grid, READ-ONLY.
--
-- D-081 (fixed by 0311_tick_box_rm_auto_approves): a spare approved with the
-- TICK BOXES on RM Approval had only its RM approval written, so a spare whose
-- cover does not need Commercial (anything but AMC / OGP) went on to wait at
-- Commercial. The single-spare Approve button never did this. 0311 fixes new
-- approvals only; it moves nothing already waiting. This lists those lines so
-- the decision on them can be made with the numbers in front of it.
--
-- Row 1 is the count, rows 2+ by cover and route; rows 101+ the lines
-- themselves (OR number, engineer, part, cover, when RM approved, and whether
-- Commercial has typed anything on them yet). Nothing to change; paste and run.
-- ===========================================================================
with l as (
  select l.id, r.or_no, r.uid, r.engineer, l.part, coalesce(r.item_status, '') as cover,
         coalesce(r.req_type, '') as route, l.rm_at,
         coalesce(l.commercial_approval, 'Pending') as commercial
    from public.spare_request_lines l
    join public.spare_requests r on r.uid = l.request_uid
   where public.spare_line_stage(coalesce(l.rm_approval, 'Pending'), coalesce(l.commercial_approval, 'Pending'),
           coalesce(l.nsm_approval, 'Pending'), coalesce(l.stores_status, 'Pending'), l.received_at, r.item_status) = 'Commercial'
     and not public.spare_needs_commercial(r.item_status)
)
select row_no, what, n, detail from (
  select 1 as row_no, 'spares at Commercial that do not need Commercial' as what, count(*)::text as n, '' as detail from l
  union all select * from (select 1 + row_number() over (order by cover, route)::int, 'cover ' || coalesce(nullif(cover, ''), '(blank)') || ' / ' || route,
                                  count(*)::text, '' from l group by cover, route order by cover, route) g
  union all select * from (select 100 + row_number() over (order by rm_at, id)::int,
                                  or_no || ' · ' || engineer, part,
                                  'cover ' || coalesce(nullif(cover, ''), '(blank)') || ' · ' || route
                                  || ' · RM ' || coalesce(to_char(rm_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'), '?')
                                  || ' · Commercial: ' || commercial
                             from l order by rm_at, id limit 500) d
) r
order by row_no;
