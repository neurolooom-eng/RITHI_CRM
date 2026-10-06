-- ===========================================================================
-- STORES DISPATCH REPORT -- CALENDAR 2025 FROM THE HISTORICAL STOCK OUTS.
--
-- The user, 2026-10-06: "in the Stores Dispatch objective - I need for the
-- Whole year. Fetch it from the Historical Data." Asked which year: "A" --
-- calendar 2025, January to December.
--
-- 0385 reads only dispatches made IN this system (spare_dispatches), and the
-- AppSheet Stores file it was built from holds 2026 alone (8,314 of 8,315
-- rows). 2025 lives in spare_issue_history -- the stock-out export, loaded by
-- Bulk Uploads -> "Stock Out -- all years" -- where every column the table has
-- no field for is kept in `data` EXACTLY AS TYPED. So this arm reads the
-- format's own headings out of `data`:
--
--   Timestamp ................ issued_at; where the upload left it empty (the
--                              file's heading is "Timestamp", which that
--                              register does not map), data."Timestamp".
--                              A row with neither is NOT in the report: a
--                              dispatch with no date cannot be placed in 2025.
--   OR Date, Request Final
--   Approval Date ............ data, day-first (dd/mm/yyyy hh:mm:ss, India
--                              time) -- how AppSheet writes them.
--   Dispatched in (Days) ..... COMPUTED, the same exact rule as 0385, never
--                              copied from the file: AppSheet's figure is
--                              date-minus-date, and two rules in one column
--                              would make the bands disagree with themselves.
--                              No approval date -> blank, "No approval date".
--   Pending QTY, Sl No ....... data, where they are numbers; blank otherwise.
--   Requested Qty ............ blank -- the export does not carry it.
--   Dispatch Line ID ......... the history row's id NEGATED, so it can never
--                              equal a live dispatch line's id and the paged
--                              read's tiebreaker stays unique.
--   Source (new, LAST) ....... 'RITHI' or 'Historical', so either can be told
--                              apart in the file.
--
-- ONLY 2025, by the dispatch date in India time -- the year asked for. A stock
-- out that is ALSO a live dispatch (same SO NO, or its request line has a
-- dispatch line here) is left to the live arm, so nothing is counted twice.
--
-- dmy_ts() parses a day-first string, GUARDED ON THE SHAPE (0190's lesson:
-- to_timestamp() on rubbish returns a wrong date rather than an error), and
-- also accepts an ISO string. Anything else is NULL -- a blank, never a guess.
-- ===========================================================================

create or replace function public.dmy_ts(v text)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare s text := btrim(coalesce(v, ''));
begin
  if s = '' then return null; end if;
  if s ~ '^\d{1,2}/\d{1,2}/\d{4}$' then
    return to_timestamp(s, 'DD/MM/YYYY')::timestamp at time zone 'Asia/Kolkata';
  elsif s ~ '^\d{1,2}/\d{1,2}/\d{4} \d{1,2}:\d{2}$' then
    return to_timestamp(s, 'DD/MM/YYYY HH24:MI')::timestamp at time zone 'Asia/Kolkata';
  elsif s ~ '^\d{1,2}/\d{1,2}/\d{4} \d{1,2}:\d{2}:\d{2}$' then
    return to_timestamp(s, 'DD/MM/YYYY HH24:MI:SS')::timestamp at time zone 'Asia/Kolkata';
  elsif s ~ '^\d{4}-\d{2}-\d{2}' then
    return s::timestamptz;
  end if;
  return null;
exception when others then
  return null;
end $$;
comment on function public.dmy_ts(text) is
  'Day-first dd/mm/yyyy[ hh:mm[:ss]] (India time) or ISO -> timestamptz; anything else NULL. Reads AppSheet dates kept as text in an import''s data (0387).';

-- A number kept as text ("1", "1,200") -> numeric; anything else NULL.
create or replace function public.text_num(v text)
returns numeric
language sql
immutable
as $$
  select case when replace(btrim(coalesce(v, '')), ',', '') ~ '^-?\d+(\.\d+)?$'
              then replace(btrim(v), ',', '')::numeric end
$$;

drop view if exists public.stores_dispatch_report;
create view public.stores_dispatch_report as
with base as (
  select
    dl.id                                              as line_key,
    d.uid                                              as stock_out_no,
    d.dispatched_at,
    coalesce(d.engineer, '')                           as engineer,
    coalesce(dl.part, '')                              as part,
    public.part_code(dl.part)                          as part_code,
    btrim(coalesce(nullif(split_part(coalesce(dl.part, ''), '|', 2), ''), pt.description, '')) as part_desc,
    dl.qty                                             as dispatched_qty,
    l.qty                                              as requested_qty,
    greatest(coalesce(l.qty, 0) - coalesce(l.dispatched_qty, 0), 0) as pending_qty,
    l.row_no,
    coalesce(r.or_no, '')                              as or_no,
    r.created_at                                       as or_at,
    greatest(l.rm_at, l.commercial_at, l.nsm_at)       as approved_at,
    coalesce(r.item_status, '')                        as item_status,
    coalesce(pt.ind_imp, '')                           as ind_imp,
    concat_ws(E'\n',
      nullif(btrim(coalesce(ud.address, '')), ''),
      nullif(concat_ws(' , ', nullif(btrim(coalesce(ud.city, '')), ''), nullif(btrim(coalesce(ud.state, '')), '')), ''),
      case when btrim(coalesce(ud.phone, '')) <> '' then 'PHONE NO : ' || btrim(ud.phone) end) as address,
    'Dispatched'::text                                 as stores_status,
    'RITHI'::text                                      as source
  from public.spare_dispatch_lines dl
  join public.spare_dispatches    d on d.uid = dl.dispatch_uid
  join public.spare_request_lines l on l.id  = dl.line_id
  join public.spare_requests      r on r.uid = l.request_uid
  left join lateral (
    select p.description, p.ind_imp from public.parts p
     where p.code = public.part_code(dl.part) order by p.id limit 1) pt on true
  left join lateral (
    select u.address, u.city, u.state, u.phone from public.user_directory u
     where lower(btrim(u.name)) = lower(btrim(coalesce(d.engineer, ''))) and btrim(coalesce(d.engineer, '')) <> ''
     order by u.id limit 1) ud on true

  union all

  -- CALENDAR 2025 FROM THE HISTORICAL STOCK OUTS (0387).
  select
    -h.id                                              as line_key,
    coalesce(h.so_no, '')                              as stock_out_no,
    hx.at_                                             as dispatched_at,
    coalesce(h.engineer, '')                           as engineer,
    coalesce(h.part, '')                               as part,
    h.part_code                                        as part_code,
    btrim(coalesce(nullif(split_part(coalesce(h.part, ''), '|', 2), ''), h.data ->> 'Part Description', pt.description, '')) as part_desc,
    h.qty                                              as dispatched_qty,
    null::numeric                                      as requested_qty,
    public.text_num(h.data ->> 'Pending QTY')          as pending_qty,
    public.text_num(h.data ->> 'Sl No')::int           as row_no,
    coalesce(nullif(btrim(h.data ->> 'Spare Request NO'), ''), nullif(split_part(coalesce(h.line_uid, ''), '|', 1), ''), '') as or_no,
    public.dmy_ts(h.data ->> 'OR Date')                as or_at,
    public.dmy_ts(h.data ->> 'Request Final Approval Date') as approved_at,
    coalesce(h.data ->> 'Item Status', '')             as item_status,
    coalesce(nullif(pt.ind_imp, ''), h.data ->> 'IND/IMP', '') as ind_imp,
    coalesce(nullif(btrim(h.data ->> 'ADDRESS'), ''), h.remarks, '') as address,
    coalesce(nullif(btrim(h.data ->> 'Stores Status'), ''), 'Dispatched') as stores_status,
    'Historical'::text                                 as source
  from public.spare_issue_history h
  cross join lateral (select coalesce(h.issued_at, public.dmy_ts(h.data ->> 'Timestamp')) as at_) hx
  left join lateral (
    select p.description, p.ind_imp from public.parts p
     where p.code = h.part_code order by p.id limit 1) pt on true
  where hx.at_ >= timestamptz '2025-01-01 00:00:00+05:30'
    and hx.at_ <  timestamptz '2026-01-01 00:00:00+05:30'
    and not exists (select 1 from public.spare_dispatches d
                     where btrim(h.so_no) <> '' and lower(btrim(d.uid)) = lower(btrim(h.so_no)))
    and not exists (select 1 from public.spare_request_lines l
                      join public.spare_dispatch_lines dl on dl.line_id = l.id
                     where btrim(h.line_uid) <> '' and lower(btrim(l.line_uid)) = lower(btrim(h.line_uid)))
),
timed as (
  select b.*,
    case when b.approved_at is null then null
         else round(extract(epoch from (b.dispatched_at - b.approved_at))::numeric / 86400.0, 1) end as days
  from base b
)
select
  t.or_no || '|' || t.part_code                                    as "Spare Request NO|Part Number",
  t.stock_out_no                                                   as "SO NO",
  t.dispatched_at                                                  as "Timestamp",
  t.engineer                                                       as "TO",
  t.address                                                        as "ADDRESS",
  t.stores_status                                                  as "Stores Status",
  concat_ws('|', nullif(t.or_no, ''), nullif(t.part_code, ''), nullif(t.part_desc, '')) as "DETAILS",
  t.or_no                                                          as "Spare Request NO",
  t.part_code                                                      as "Part Number",
  t.part_desc                                                      as "Part Description",
  t.dispatched_qty                                                 as "Dispatched Qty",
  t.pending_qty                                                    as "Pending QTY",
  nullif(regexp_replace(t.stock_out_no, '[^0-9]', '', 'g'), '')::bigint as "SO(n)",
  concat_ws('|', nullif(t.part_code, ''), nullif(t.part_desc, '')) as "Spare",
  t.or_at                                                          as "OR Date",
  t.approved_at                                                    as "Request Final Approval Date",
  t.ind_imp                                                        as "IND/IMP",
  t.item_status                                                    as "Item Status",
  t.days                                                           as "Dispatched in (Days)",
  case when t.days is null then 'No approval date'
       when t.days <= 3  then '00-03D'
       when t.days <= 7  then '04-07D'
       when t.days <= 15 then '08-15D'
       when t.days <= 30 then '16-30D'
       when t.days <= 60 then '31-60D'
       else '>60D' end                                             as "Dispatched in (Days - Group)",
  extract(year  from (t.dispatched_at at time zone 'Asia/Kolkata'))::int as "Year",
  extract(month from (t.dispatched_at at time zone 'Asia/Kolkata'))::int as "Month",
  to_char(t.dispatched_at at time zone 'Asia/Kolkata', 'YY-MM')   as "YY - MM",
  t.row_no                                                         as "Sl No",
  t.requested_qty                                                  as "Requested Qty",
  t.part                                                           as "Part (as dispatched)",
  t.line_key                                                       as "Dispatch Line ID",
  t.source                                                         as "Source"
from timed t;

alter view public.stores_dispatch_report set (security_invoker = on);
grant select on public.stores_dispatch_report to authenticated;

comment on view public.stores_dispatch_report is
  'Stores Dispatch Report (0385, 0387): one row per spare line dispatched, in the AppSheet Stores format -- live dispatches, plus calendar 2025 from the historical stock outs (Source = Historical). Final approval = latest of RM / Commercial / NSM for a live line, the file''s Request Final Approval Date for a historical one; blank where none, band "No approval date"; days to dispatch exact to one decimal, banded 00-03D ... >60D; Year / Month / YY - MM of the dispatch in India time.';
