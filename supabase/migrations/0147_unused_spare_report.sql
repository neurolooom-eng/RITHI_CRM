-- ===========================================================================
-- NOT CONSUMED AGAINST THIS CALL — spares that reached the engineer and were
-- not fully booked against the call they were sent for.
--
-- THE REPORT IS CALLED "Not Consumed Against this Call" (the user renamed it,
-- 2026-09-08). The VIEW keeps the name `unused_spare_report`: it is referenced
-- by _status.sql row 112, the query helpers and the test suite, and renaming a
-- database object to follow a label is churn with a migration attached. The
-- name people read is the one on the screen.
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
--   * A part that WAS DISPATCHED (or acknowledged as received) and is not fully
--     accounted for in that call's consumption IS here. Two findings, not one
--     (the user, 2026-09-08: "Flag if there is a Qty Mismatch as well - Say 2
--     Nos are requested but only 1 Consumed"):
--
--       NOT USED   nothing of that part was booked on the call at all.
--       SHORT      some was booked, but less than was sent -- 2 sent, 1 used.
--
--     Either way the part is fitted and unrecorded, or still in the van. Both
--     are worth chasing and neither is visible anywhere today.
--
-- AGGREGATED PER CALL AND PART, NOT PER LINE, and that is a correctness point
-- rather than a tidiness one. A part can be sent twice on one call -- two
-- orders, or a partial issue followed by the rest -- and comparing each LINE
-- against the call's consumption would flag both lines as short whenever the
-- engineer booked the total in one entry. The question being asked is "was what
-- we sent for this call used on it?", which is a question about the part, so
-- the quantities are summed on both sides before they are compared.
--
-- DISPATCHED COUNTS AS REACHED, and this is the user's own rule (2026-09-08):
-- "Dispatch is considered as reached, it is not considered as In Transit since
-- it is not Mandatory to mark a Spare as Received."
--
-- It is written down here because the opposite looks more careful and is
-- wrong. Requiring `received_at` would be the obvious tightening for somebody
-- reading this later -- and it would empty the report, because acknowledging a
-- delivery is optional and most lines never get one. The report would then say
-- "nothing to chase" for the same reason it should have said "chase all of
-- these", which is the worst failure available to it. Do not narrow this to
-- Received without making the acknowledgement mandatory first.
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
  -- Every line that actually reached the engineer. The stage tests mirror
  -- deriveStage() in src/lib/spareflow.ts: a rejection at any approval stage
  -- wins over everything, then a drop, and what is left as dispatched-or-
  -- received is what arrived.
  select
    r.ucn,
    upper(btrim(split_part(l.part, '|', 1)))                        as part_code,
    btrim(coalesce(nullif(split_part(l.part, '|', 2), ''), l.part)) as part_name,
    -- `dispatched_qty` DEFAULTS TO 0, not null, so a plain coalesce reports
    -- every line as "0 sent" -- which the test caught on its first run.
    coalesce(nullif(l.dispatched_qty, 0), l.qty)                    as qty_sent,
    coalesce(nullif(btrim(r.or_no), ''), r.uid)                     as or_no,
    r.uid                                                            as request_uid,
    r.engineer, r.engineer_email, r.party_name, r.product_name, r.serial,
    r.item_status, r.call_number,
    l.dc_number, l.dispatched_at, l.received_at
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
sent_total as (
  -- One row per call and part: what was sent, in total, however many orders it
  -- took. The identifiers are joined rather than picked, because with two
  -- orders there genuinely are two of them and choosing one would hide the
  -- other from whoever has to chase it.
  select
    ucn,
    part_code,
    min(part_name)                                          as part_name,
    sum(qty_sent)                                           as qty_sent,
    string_agg(distinct or_no, ', ' order by or_no)          as or_no,
    string_agg(distinct nullif(btrim(dc_number), ''), ', ')  as dc_number,
    string_agg(distinct request_uid, ', ')                   as request_uid,
    string_agg(distinct nullif(btrim(engineer), ''), ', ')   as engineer,
    min(engineer_email)                                      as engineer_email,
    min(party_name)                                          as party_name,
    min(product_name)                                        as product_name,
    min(serial)                                              as serial,
    min(item_status)                                         as item_status,
    min(call_number)                                         as call_number,
    max(dispatched_at)                                       as dispatched_at,
    max(received_at)                                         as received_at,
    bool_or(received_at is not null)                         as any_received
  from sent
  group by ucn, part_code
),
booked as (
  -- What was consumed against each call, by part code. A VOIDED line has qty 0
  -- and is deliberately still counted as a booking of zero: the part was fitted
  -- and then the entry corrected, and 0049 keeps the row so that story
  -- survives. Where the void took the total below what was sent, that IS a
  -- shortfall and the report should say so.
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
  coalesce(b.qty_used, 0)                    as "Qty Used",
  s.qty_sent - coalesce(b.qty_used, 0)       as "Qty Short",
  -- WHICH FINDING IT IS, in the row, so the report can be read and sorted
  -- without doing the arithmetic. "Not used" and "short by one of two" call for
  -- different conversations.
  case when coalesce(b.qty_used, 0) = 0 then 'Not used' else 'Short' end as "Finding",
  case when s.any_received then 'Received' else 'Dispatched' end          as "Stage",
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
  from sent_total s
  left join booked b on b.ucn = s.ucn and b.part_code = s.part_code
  left join public.calls c on c.ucn = s.ucn
 where coalesce(b.qty_used, 0) < s.qty_sent      -- none of it, or not all of it
   and s.part_code <> '';

alter view public.unused_spare_report set (security_invoker = on);
grant select on public.unused_spare_report to authenticated;

comment on view public.unused_spare_report is
  'Not Consumed Against this Call (the report''s name; this view keeps its own): two findings -- NOT USED (nothing of that part booked on the call) and SHORT (less booked than was sent). Aggregated per call and part, never per line: a part sent twice on one call would otherwise flag both lines as short whenever the engineer booked the total once. DISPATCHED counts as reached, because acknowledging a delivery is not mandatory and requiring it would empty the report. Spare lines dispatched or received against a call whose part code never appears in that call''s consumption. Refused and dropped lines are excluded -- nothing arrived, so nothing could be fitted. Matched on the part CODE because both sides store CODE|Description and the description drifts. security_invoker, so a reader sees only the calls their role allows.';
