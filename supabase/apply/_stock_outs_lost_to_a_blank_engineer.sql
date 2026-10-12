-- ===========================================================================
-- HISTORICAL STOCK OUTS THAT REACH NOBODY'S HAND STOCK (2026-10-08).
-- READ-ONLY. One grid.
--
-- Found on ABHISHEK BISWAS / ESA-009 (SO17541): a history row is skipped
-- because its line_uid is a live request line marked dispatched, and the live
-- line is booked to the REQUEST's engineer -- which on an imported request can
-- be BLANK, or somebody else. Then the unit is on nobody's hand stock (blank)
-- or on another engineer's. This counts, over the whole register, the history
-- rows skipped that way, by what the live line books instead:
--   same engineer     the live line books it to the same engineer (correct)
--   blank engineer    the live request has no engineer -- the unit is lost
--   other engineer    the live request names somebody else
-- Rows 101+ are the first 30 of the last two kinds, for checking by hand.
-- ===========================================================================
with skipped as (
  select h.id, h.engineer as hist_engineer, h.engineer_key as hist_key, h.part_code, h.qty, h.so_no, h.line_uid,
         coalesce(h.issued_at, h.created_at) as issued,
         r.or_no, r.engineer as req_engineer, public.handstock_key(r.engineer) as req_key
    from public.spare_issue_history h
    join public.spare_request_lines l on h.line_uid <> '' and lower(btrim(l.line_uid)) = lower(btrim(h.line_uid))
         and (coalesce(l.dispatched_qty, 0) > 0 or coalesce(l.stores_status, '') ~* 'dispatch')
    join public.spare_requests r on r.uid = l.request_uid
   where coalesce(h.issued_at, h.created_at) >= (select public.handstock_cutoff())
), kinds as (
  select s.*, case when btrim(coalesce(s.req_key, '')) = '' then 'blank engineer'
                   when s.req_key = s.hist_key then 'same engineer'
                   else 'other engineer' end as kind
    from skipped s
)
select k as row, kind, n as history_rows, units, '' as detail
  from (select row_number() over (order by kind) as k, kind, count(*) as n, sum(qty) as units
          from kinds group by kind) t
union all
select 100 + row_number() over (order by kind, issued, id), kind, 1, qty,
       hist_engineer || ' | ' || part_code || ' | ' || coalesce(so_no, '') || ' | '
       || to_char(issued at time zone 'Asia/Kolkata', 'DD-Mon-YY') || ' | live ' || coalesce(or_no, '')
       || ' booked to ' || coalesce(nullif(btrim(req_engineer), ''), '(blank)')
  from (select * from kinds where kind <> 'same engineer' order by kind, issued, id limit 30) x
order by 1;
