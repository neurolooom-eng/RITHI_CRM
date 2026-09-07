-- ===========================================================================
-- THE KPI WORKBOOK'S "Field_INST" SHEET, FROM THE REGISTER.
--
-- The user's KPI workbook is maintained by hand; this is its Field_INST tab
-- computed from the calls instead. PHASE 1 (their scoping, 2026-09-07) is
-- columns A to AB — the same fields, in the same order, under the same
-- headings — plus the two dates the sheet fills in by eye. AC to AG (Attended
-- in Days, Solved in Days, TTA, TTS, Failure Month) are formulas in the
-- workbook and are Phase 2.
--
-- THE THREE RULES THEY GAVE, and each is a decision, not a detail:
--
--   CALL ATTENDED ON = the EARLIER of the first visit and the first spare
--   request. A spare raised before anyone visits is still somebody attending
--   to the call — often the first thing that happens on a fault that needs a
--   part. `least()` ignores NULLs in Postgres, so a call with one and not the
--   other gets the one it has, and a call with neither is blank.
--
--   CALL SOLVED = the visit date of the entry that moved it to "Solved -
--   Report Completed". Not the last visit, and not the day somebody typed it
--   in: the visit on which the machine was actually fixed. Where a call was
--   solved, reopened and solved again, it is the LATEST such entry, because
--   that is the one the call's current status comes from (0032 — the latest
--   ENTRY, `updated_at desc, id desc`, not the latest visit DATE).
--
--   OPEN / CLOSE = Close ONLY when the call is Solved - Report Completed.
--   Anything else is Open, including "Solved - Report Pending": the workbook
--   counted a report-pending call as open and so does this.
--
--   CANCELLED CALLS ARE NOT CONSIDERED AT ALL — not as Open, not as Close,
--   not in the row count. The sheet counted them as Close, which is why its
--   581 "Close" rows are 563 completed calls plus 18 cancellations; this view
--   drops them, so Close means solved and nothing else.
--
-- PM calls are not here: the workbook keeps them on their own tab.
-- ===========================================================================

create or replace view public.kpi_field_inst as
with c as (
  select ucn, call_number, reg_at, reg_date, complaint_date, party_name, city, state,
         product_name, serial, item_status, warranty_number, warranty_start, warranty_end,
         contract_number, contract_start, contract_end, contract_type, call_type,
         standard_complaint, complaint_reported, allocated_to, breakdown_date
    from public.field_calls where cancelled_at is null
  union all
  select ucn, call_number, reg_at, reg_date, complaint_date, party_name, city, state,
         product_name, serial, item_status, warranty_number, warranty_start, warranty_end,
         contract_number, contract_start, contract_end, contract_type, call_type,
         standard_complaint, complaint_reported, allocated_to, breakdown_date
    from public.installation_calls where cancelled_at is null
),
-- The call's CURRENT visit — the latest ENTRY, which is what its status comes
-- from. A call with no visit has none, and reads as Unattended below.
latest as (
  select distinct on (ucn) ucn, call_status, pending_reason, engineer
    from public.reports
   order by ucn, updated_at desc, id desc
),
-- The entry that put it at Solved - Report Completed, latest first so a call
-- solved twice reports the solve that is currently standing.
solved as (
  select distinct on (ucn) ucn, visit_at
    from public.reports
   where call_status ilike 'solved%report%complet%'
   order by ucn, updated_at desc, id desc
),
first_visit as (
  select ucn, min(visit_at) as at from public.reports where visit_at is not null group by ucn
),
-- The first spare RAISED on the call. or_req_date is the request's own date;
-- created_at is when the row was written, and is the fallback for an imported
-- request that never carried one.
first_spare as (
  select ucn, min(coalesce(or_req_date, created_at::date)) as on_date
    from public.spare_requests
   where coalesce(btrim(ucn), '') <> ''
   group by ucn
)
select
  c.ucn                                          as "UC Number",
  c.call_number                                  as "Call Number",
  coalesce(c.reg_at, c.reg_date::timestamptz)    as "Call Registeration Date",
  c.complaint_date                               as "Complaint Date",
  c.party_name                                   as "Party Name",
  c.city                                         as "City",
  c.state                                        as "State",
  c.product_name                                 as "Product Name",
  c.serial                                       as "Product Serial Number",
  c.item_status                                  as "Item Status",
  c.warranty_number                              as "Warranty Number",
  c.warranty_start                               as "Warranty Start Date",
  c.warranty_end                                 as "Warranty End Date",
  c.contract_number                              as "Contract Number",
  c.contract_start                               as "Contract Start Date",
  c.contract_end                                 as "Contract End Date",
  c.contract_type                                as "Contract Type",
  c.call_type                                    as "Call Type",
  c.standard_complaint                           as "Standard Complaint",
  c.complaint_reported                           as "Complaint Reported",
  c.allocated_to                                 as "Call Allocated To",
  c.breakdown_date                               as "Breakdown Date",
  case when s.visit_at is not null then 'Close' else 'Open' end
                                                 as "Open/Close",
  coalesce(nullif(btrim(l.call_status), ''), 'Unattended')
                                                 as "Call Status",
  coalesce(l.pending_reason, '')                 as "CALL PENDING REASON",
  coalesce(l.engineer, '')                       as "Visiting Service Engineer",
  least(fv.at::date, fs.on_date)                 as "Call Attended On",
  s.visit_at::date                               as "Call Solved Date & Time"
  from c
  left join latest      l  on l.ucn  = c.ucn
  left join solved      s  on s.ucn  = c.ucn
  left join first_visit fv on fv.ucn = c.ucn
  left join first_spare fs on fs.ucn = c.ucn;

-- READS AS THE READER. Without this the view runs as its owner and row-level
-- security stops applying: an engineer's export would be every call in the
-- company. `create or replace view` DROPS the setting, so it is re-asserted
-- here and must be on every rebuild (CLAUDE.md).
alter view public.kpi_field_inst set (security_invoker = on);
grant select on public.kpi_field_inst to authenticated;

comment on view public.kpi_field_inst is
  'The KPI workbook''s Field_INST tab, columns A-AB, from the register. Cancelled calls are excluded entirely; Close means Solved - Report Completed and nothing else; Call Attended On is the earlier of the first visit and the first spare request; Call Solved is the visit date of the entry that completed it. AC-AG are workbook formulas (Phase 2).';
