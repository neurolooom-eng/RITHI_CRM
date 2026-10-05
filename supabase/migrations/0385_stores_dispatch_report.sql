-- ===========================================================================
-- STORES DISPATCH REPORT -- the AppSheet "Stores" view, one row per spare
-- line dispatched, with how long Stores took after the request was approved.
--
-- The user, 2026-10-05: "I need Objective Data for Stores. Attached the
-- Format." (AppSheet.ViewData.2026-10-05.csv, 8,315 rows.) Settled with the
-- user the same day: a DATA REPORT only (no objective row); the IND/IMP field
-- added to the Part Master; days counted as EXACT elapsed time, in days with a
-- decimal -- not AppSheet's date-minus-date, which reads a dispatch at 09:00
-- the morning after a 17:00 approval as one whole day.
--
-- 1. parts.ind_imp -- Indigenous / Imported / TBD, typed on the Part Master or
--    loaded by its bulk upload. FREE TEXT, NO CHECK, and that is deliberate: a
--    check on `parts` aborts a bulk import part-written (0152's lesson); the
--    form offers the three words.
--
-- 2. public.stores_dispatch_report -- the format's columns, by their headings:
--    "Request Final Approval Date" is the LATEST of the line's RM, Commercial
--    and NSM decisions (spare_line_stage's order: whichever came last is when
--    the line became Stores' to send). Where NO approval was ever recorded it
--    is BLANK and the band says "No approval date" -- AppSheet subtracted an
--    empty date and filed those 188 rows under ">5 yrs", 45,839 days, which
--    is a missing value dressed as a measurement. spare_stock_out_lines falls
--    back to the request's creation instead; this report does not, because a
--    figure about Stores must not be computed from a date that is not an
--    approval.
--    Bands on the exact days: <=3 00-03D, <=7 04-07D, <=15 08-15D, <=30
--    16-30D, <=60 31-60D, beyond that >60D. A dispatch BEFORE the recorded
--    approval (negative days) stays in 00-03D, as AppSheet put its six.
--    Year / Month / YY - MM are of the DISPATCH, in India time.
--    "Pending QTY" is what is still to send on the line after every dispatch
--    so far (qty - dispatched_qty); "Requested Qty" is the line's own qty.
--
-- security_invoker, so whoever reads it sees exactly the dispatches the stock
-- out register shows them (sd_read and the spare policies).
--
-- 3. mod:/exports/stores-dispatch merged into Admin, Technical Support (which
--    holds every page key the admin does -- _status.sql row 114), Stores
--    Incharge and Spare Coordinator -- MERGE, never overwrite; a role with an EMPTY set is left
--    alone. Any role holding Reports (mod:/exports) sees it already: a report
--    key falls back to that one.
-- ===========================================================================

alter table public.parts add column if not exists ind_imp text not null default '';
comment on column public.parts.ind_imp is
  'Indigenous / Imported / TBD -- typed on the Part Master or loaded by its upload. Free text on purpose: a CHECK on parts aborts a bulk import part-written (0152). Shown as IND/IMP on the Stores Dispatch Report (0385).';

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
    ud.address, ud.city, ud.state, ud.phone
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
  concat_ws(E'\n',
    nullif(btrim(coalesce(t.address, '')), ''),
    nullif(concat_ws(' , ', nullif(btrim(coalesce(t.city, '')), ''), nullif(btrim(coalesce(t.state, '')), '')), ''),
    case when btrim(coalesce(t.phone, '')) <> '' then 'PHONE NO : ' || btrim(t.phone) end)
                                                                   as "ADDRESS",
  'Dispatched'::text                                               as "Stores Status",
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
  t.line_key                                                       as "Dispatch Line ID"
from timed t;

alter view public.stores_dispatch_report set (security_invoker = on);
grant select on public.stores_dispatch_report to authenticated;

comment on view public.stores_dispatch_report is
  'Stores Dispatch Report (0385): one row per spare line dispatched, in the AppSheet Stores format -- final approval = latest of RM / Commercial / NSM (blank where none, band "No approval date"), days to dispatch exact to one decimal, banded 00-03D ... >60D; Year / Month / YY - MM of the dispatch in India time.';

do $$
declare n int;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select 'mod:/exports/stores-dispatch') u),
         updated_at = now()
   where ar.role in ('admin', 'technical_support', 'stores_incharge', 'spare_coordinator')
     and jsonb_array_length(ar.permissions) > 0
     and not (ar.permissions ? 'mod:/exports/stores-dispatch');
  get diagnostics n = row_count;
  raise notice '0385: % role(s) given the Stores Dispatch Report', n;
end $$;
