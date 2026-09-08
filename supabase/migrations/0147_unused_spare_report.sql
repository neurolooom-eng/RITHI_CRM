-- ===========================================================================
-- NOT USED AS PER THE REQUEST — spares that reached the engineer and were
-- never booked against the call they were sent for.
--
-- The user, 2026-09-08: "Flag if something was Requested but never used in the
-- Consumption of that call. --- 'Not Used as per the Request' -- Create a
-- Separate Report of these Flagged items."
--
-- WHAT IT MEANS, precisely, because the wording admits three readings and only
-- one of them is a finding:
--
--   * A part that never got past an approver is NOT here. It was refused, so
--     there was nothing to use; that is a decision on the spare register, not a
--     discrepancy on the call.
--   * A part Stores DROPPED is not here either. Approved and then not sent is a
--     supply failure -- worth knowing, and visible on the call -- but again
--     nothing arrived, so nothing could be fitted.
--   * A part that WAS DISPATCHED (or acknowledged as received) and appears
--     nowhere in that call's consumption IS here. It is either fitted and never
--     recorded, or still in the van. Both are worth chasing and neither is
--     visible anywhere today.
--
-- MATCHED ON THE PART CODE, NOT THE WHOLE STRING. Both sides store
-- "CODE|Description" and the description drifts -- case, spacing, a part
-- renamed in the master after the request was raised. Matching the whole thing
-- would report a part as unused because somebody re-typed its name, which is
-- the worst kind of false finding: confident, specific and wrong.
--
-- SCOPED TO THE CALL. A part consumed on a DIFFERENT call does not clear this
-- one: the question is whether what was sent FOR THIS CALL was used ON IT.
--
-- A VIEW, not a computation in the browser. The registers page, so a check done
-- on the loaded rows would report on the first page and call it the whole
-- answer -- the same reason the consumption report's filters run in the
-- database (0142).
--
-- SECURITY INVOKER, so a reader sees only the calls their role allows. It joins
-- `calls`, which is itself invoker (0105), and a view that reads as its owner
-- over RLS-protected tables is the exact shape `npm run check:views` rejects.
-- ===========================================================================

drop view if exists public.unused_spare_report;
create view public.unused_spare_report as
with sent as (
  -- Every line that actually reached the engineer, with its call and its part
  -- code. The stage tests mirror deriveStage() in src/lib/spareflow.ts: a
  -- rejection at any approval stage wins over everything, then a drop, and what
  -- is left as dispatched-or-received is what arrived.
  select
    r.ucn,
    r.call_number,
    coalesce(nullif(btrim(r.or_no), ''), r.uid)              as or_no,
    r.uid                                                     as request_uid,
    r.engineer,
    r.engineer_email,
    r.party_name,
    r.product_name,
    r.serial,
    r.item_status,
    l.part                                                    as part,
    upper(btrim(split_part(l.part, '|', 1)))                  as part_code,
    btrim(coalesce(nullif(split_part(l.part, '|', 2), ''), l.part)) as part_name,
    -- `dispatched_qty` DEFAULTS TO 0, not null, so a plain coalesce reports
    -- every line as "0 sent" -- which the test caught on its first run.
    coalesce(nullif(l.dispatched_qty, 0), l.qty)              as qty_sent,
    l.dc_number,
    l.dispatched_at,
    l.received_at,
    case when l.received_at is not null then 'Received' else 'Dispatched' end as stage
  from public.spare_request_lines l
  join public.spare_requests r on r.uid = l.request_uid
  where btrim(coalesce(r.ucn, '')) <> ''
    -- Arrived.
    and (l.received_at is not null or coalesce(l.stores_status, '') ilike '%dispatch%')
    -- ...and was not refused or dropped on the way.
    and coalesce(l.stores_status, '') not ilike '%drop%'
    and coalesce(l.rm_approval, '')         !~* 'reject'
    and coalesce(l.commercial_approval, '') !~* 'reject'
    and coalesce(l.nsm_approval, '')        !~* 'reject'
),
booked as (
  -- What was consumed against each call, by part code. A VOIDED line has qty 0
  -- and is deliberately still counted as "booked": the part was fitted and then
  -- the entry corrected, which is a different story from never being recorded
  -- at all, and 0049 keeps the row precisely so that story survives.
  select c.ucn,
         upper(btrim(split_part(c.part, '|', 1))) as part_code,
         sum(coalesce(c.qty, 0))                  as qty_used
    from public.spare_consumption c
   group by 1, 2
)
select
  s.ucn,
  s.call_number,
  s.or_no                                    as "OR No",
  s.part_code                                as "Part Code",
  s.part_name                                as "Part name",
  s.qty_sent                                 as "Qty Sent",
  s.stage                                    as "Stage",
  s.dc_number                                as "DC No",
  s.dispatched_at::date                      as "Dispatched On",
  s.received_at::date                        as "Received On",
  s.engineer                                 as "Engineer",
  s.party_name                               as "Customer",
  s.product_name                             as "Product",
  s.serial                                   as "Serial No",
  s.item_status                              as "Item Status",
  c.reg_date                                 as "Call Registered",
  c.open_state                               as "Call Status",
  c.allocated_to                             as "Allotted To",
  c.state                                    as "State",
  c.city                                     as "City",
  s.request_uid                              as "Request UID",
  s.engineer_email                           as "Engineer Email"
  from sent s
  left join booked b on b.ucn = s.ucn and b.part_code = s.part_code
  left join public.calls c on c.ucn = s.ucn
 where b.part_code is null       -- nothing of that part booked on that call
   and s.part_code <> '';

alter view public.unused_spare_report set (security_invoker = on);
grant select on public.unused_spare_report to authenticated;

comment on view public.unused_spare_report is
  'Not Used as per the Request: spare lines DISPATCHED or RECEIVED against a call whose part code never appears in that call''s consumption. Refused and dropped lines are excluded -- nothing arrived, so nothing could be fitted. Matched on the part CODE because both sides store CODE|Description and the description drifts. security_invoker, so a reader sees only the calls their role allows.';
