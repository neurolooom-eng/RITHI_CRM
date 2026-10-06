-- ===========================================================================
-- WHAT THE HISTORICAL STOCK OUTS CAN GIVE THE STORES DISPATCH REPORT.
-- READ-ONLY. Run by hand in the Supabase SQL editor; it changes nothing.
--
-- The user, 2026-10-06: "in the Stores Dispatch objective - I need for the
-- Whole year. Fetch it from the Historical Data."
--
-- The report (stores_dispatch_report, 0385) reads only dispatches made IN this
-- system (spare_dispatches). The years before live in spare_issue_history --
-- the stock-out export, loaded by Bulk Uploads -> "Stock Out -- all years" --
-- and every column of that file the table has no field for is kept in `data`
-- exactly as it was typed. Whether the report can show "Request Final Approval
-- Date" and "Dispatched in (Days)" for those years depends on which columns the
-- file carried and how its dates are written. Neither is in the repository;
-- this asks the project.
--
-- ONE grid:
--   1-9    how many stock outs each side holds, and by year
--   10-12  how much of the history is the SAME stock out as a live dispatch
--   101+   every column kept in `data`: how many rows carry it, and a sample
-- ===========================================================================

with
h as (
  select h.*, coalesce(h.issued_at, h.created_at) as at_ from public.spare_issue_history h
),
d as (
  select d.uid, d.dispatched_at from public.spare_dispatches d
),
yrs as (
  select y, sum(nh)::bigint as nh, sum(nd)::bigint as nd from (
    select extract(year from (at_ at time zone 'Asia/Kolkata'))::int as y, 1 as nh, 0 as nd from h
    union all
    select extract(year from (dispatched_at at time zone 'Asia/Kolkata'))::int, 0, 1 from d
  ) x group by y
),
keys as (
  select k, count(*) as n,
         min(h.data ->> k) filter (where btrim(coalesce(h.data ->> k, '')) <> '') as sample_min,
         max(h.data ->> k) filter (where btrim(coalesce(h.data ->> k, '')) <> '') as sample_max
    from h, jsonb_object_keys(h.data) k
   group by k
),
report(n, item, value) as (
  select 1, 'Historical stock-out rows (spare_issue_history)', (select count(*) from h)::text
  union all select 2, 'Earliest / latest historical stock out',
    (select coalesce(to_char(min(at_) at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '--') || '  to  '
          || coalesce(to_char(max(at_) at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '--') from h)
  union all select 3, 'Historical rows with NO stock-out date (dated by load time instead)',
    (select count(*) from h where issued_at is null)::text
  union all select 4, 'Live dispatch rows (spare_dispatches) -- what the report shows today', (select count(*) from d)::text
  union all select 5, 'Earliest / latest live dispatch',
    (select coalesce(to_char(min(dispatched_at) at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '--') || '  to  '
          || coalesce(to_char(max(dispatched_at) at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '--') from d)
  union all select 6, 'By year (India time): history rows / live dispatches',
    (select string_agg(coalesce(y::text, 'no date') || ': ' || nh || ' / ' || nd, '   ' order by y nulls last) from yrs)
  union all select 10, 'History rows whose SO NO is also a live dispatch (the same stock out twice)',
    (select count(*) from h where btrim(h.so_no) <> ''
        and exists (select 1 from d where lower(btrim(d.uid)) = lower(btrim(h.so_no))))::text
  union all select 11, 'History rows whose request line has a live dispatch line',
    (select count(*) from h where btrim(h.line_uid) <> ''
        and exists (select 1 from public.spare_request_lines l
                      join public.spare_dispatch_lines dl on dl.line_id = l.id
                     where lower(btrim(l.line_uid)) = lower(btrim(h.line_uid))))::text
  union all select 12, 'History rows carrying a request line id (Spare Request NO|Part Number)',
    (select count(*) from h where btrim(h.line_uid) <> '')::text
  union all
  select 100 + row_number() over (order by n desc, k)::int,
         'Column in the file: ' || k,
         n || ' rows   e.g. ' || coalesce(left(sample_min, 40), '--') || '   ...   ' || coalesce(left(sample_max, 40), '--')
    from keys
)
select n as "#", item as "What", value as "Value"
  from report
 order by n;
