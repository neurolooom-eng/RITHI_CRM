-- ===========================================================================
-- 0191 — THE CALL REPORT AND THE CUSTOMER FEEDBACK REPORT.
--
-- The user, 2026-09-14: "Add Call Report , Customer Feedback Report -- Follow
-- the Same concept of Consumption Report."
--
-- So: the same shape as 0142, and the same three properties that make that one
-- trustworthy rather than merely convenient —
--
--   * ONE ROW PER RECORD, joined to what a reader needs beside it, so the file
--     is what it appears to be and nobody has to de-duplicate it afterwards.
--   * `security_invoker = on`. These read the `calls` view and `feedback`,
--     both under RLS, and a report view that ran as its OWNER would hand every
--     call in the company to anybody who could open the screen. That is the
--     fault this project has shipped twice; see the note in CLAUDE.md.
--   * THE COLUMN NAMES ARE THE HEADINGS, quoted, so there is no second
--     spelling to keep in step with the file.
--
-- Filtering happens in the DATABASE, from the screen — a filter applied after
-- the fetch can only narrow what was already fetched, and these registers page.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE CALL REPORT — one row per call.
--
-- NOT one row per visit. A call with four visits is one call, and a report that
-- repeated it four times would have every count in it wrong. The LATEST visit
-- is carried alongside, by the same ordering `sync_call_last_visit()` uses in
-- 0032 — the last thing somebody WROTE, not the latest visit date, or a report
-- entered late would silently outrank a visit made after it.
-- ---------------------------------------------------------------------------
drop view if exists public.call_report;

create view public.call_report as
with last_visit as (
  select distinct on (ucn) ucn, visit_at, updated_at, engineer, call_status, pending_reason
    from public.reports
   order by ucn, updated_at desc, id desc
),
visit_count as (
  select ucn, count(*) as n from public.reports group by ucn
),
spares as (
  -- What was fitted, gathered onto the call. A reader asking "what happened to
  -- this call" wants the parts beside it, and the alternative is opening the
  -- consumption report and joining by hand.
  select ucn, count(*) as lines, sum(qty) as qty,
         string_agg(distinct btrim(split_part(part, '|', 1)), ', ' order by btrim(split_part(part, '|', 1))) as parts
    from public.spare_consumption
   where coalesce(qty, 0) > 0
   group by ucn
)
select
  -- ---- the call itself ------------------------------------------------------
  c.ucn                                  as "UC Number",
  c.call_number                          as "Call Number",
  c.call_type                            as "Call Type",
  c.reg_date                             as "Call Date",
  c.complaint_date                       as "Complaint Date",
  c.party_name                           as "Customer",
  c.city                                 as "City",
  c.state                                as "State",
  c.product_name                         as "Product",
  c.serial                               as "Serial No",
  c.standard_complaint                   as "Complaint",
  c.allocated_to                         as "Allocated To",
  c.open_state                           as "Call Status",
  v.visit_at                             as "Last Visit Date",
  v.updated_at                           as "Last Visit Entry Date",
  coalesce(v.engineer, '')               as "Last Visit Engineer",
  coalesce(v.call_status, '')            as "Last Visit Status",
  coalesce(n.n, 0)                       as "Visits",
  coalesce(s.lines, 0)                   as "Spare Lines",
  coalesce(s.qty, 0)                     as "Spare Qty",
  coalesce(s.parts, '')                  as "Spares Used",
  -- ---- and everything else the call carries ---------------------------------
  c.complaint_reported                   as "Nature of Complaint",
  c.item_status                          as "Item Status",
  c.warranty_number                      as "Warranty No",
  c.warranty_start                       as "Warranty Start",
  c.warranty_end                         as "Warranty End",
  c.contract_number                      as "Contract No",
  c.contract_start                       as "Contract Start",
  c.contract_end                         as "Contract End",
  c.contract_type                        as "Contract Type",
  c.mode_of_reporting                    as "Mode of Reporting",
  c.person_calling                       as "Person Calling",
  c.customer_name                        as "Contact Name",
  c.customer_number                      as "Contact Number",
  c.customer_designation                 as "Contact Designation",
  c.email_address                        as "Contact Email",
  c.breakdown_date                       as "Breakdown Date",
  c.public_health_threat                 as "Public Health Threat",
  c.death                                as "Death",
  c.serious_incident                     as "Serious Incident",
  c.allocated_to_email                   as "Engineer Email",
  c.status                               as "Status (as keyed)",
  c.last_status                          as "Last Status",
  c.reg_at                               as "Registered At",
  c.added_on                             as "Added On",
  c.reopened_at                          as "Reopened At",
  c.reopen_count                         as "Reopen Count",
  c.cancelled_at                         as "Cancelled At",
  c.cancel_reason                        as "Cancel Reason",
  coalesce(v.pending_reason, '')          as "Last Pending Reason",
  c.created_at                           as "Created At"
  from public.calls c
  left join last_visit v  on v.ucn = c.ucn
  left join visit_count n on n.ucn = c.ucn
  left join spares s      on s.ucn = c.ucn;

alter view public.call_report set (security_invoker = on);
grant select on public.call_report to authenticated;

comment on view public.call_report is
  'One row per CALL — never per visit — with its latest visit and what was fitted. security_invoker, so it shows a reader exactly the calls they may see and no more.';

-- ---------------------------------------------------------------------------
-- 2. THE CUSTOMER FEEDBACK REPORT — one row per feedback, questions as columns.
--
-- THE QUESTIONS ARE REAL COLUMNS rather than a JSON blob, because a report is
-- read in a spreadsheet and "answers" as one cell of JSON is not an answer to
-- anybody. Their names are the EXPORT'S OWN HEADINGS, verbatim, measured
-- against the user's v2Feedback - Merge.csv (24,749 rows) rather than invented:
--
--     INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment     24,748
--     INSTALLATION/PM/FIELD-In general, support of our company ...     24,748
--     PM/FIELD-Ability of our Product to meet your requirement         23,759
--     PM/FIELD-Reliability of Product                                  23,759
--     PM/FIELD-Reliability of Service                                  23,759
--     PM/FIELD-Promptness for Service Calls                            23,759
--     Advance PM Done?                                                  9,402
--     INSTALLATION/PM/FIELD-Remarks if any                              7,284
--     INSTALLATION-Startup, Training and Handing Over                   1,009
--     INSTALLATION-Packing and Forwarding                               1,009
--     INSTALLATION-Delivery adherence schedule                          1,009
--     Warranty Start Date?                                              1,009
--
-- The three counts are the three kinds of visit: every feedback answers the
-- first two, a PM or field visit answers four more, an installation answers a
-- different four. A BLANK IS NOT A GAP on those — it means the question was not
-- asked of that visit — and the screen says so rather than leaving a reader to
-- read an empty cell as a missing answer.
--
-- `Month`, `Year`, `Quater` and `Half-Yearly` are in the export and are NOT
-- carried: they are the date restated, and a period column that can disagree
-- with the date beside it is a liability in a file somebody sorts.
--
-- `answers` still rides along whole, so a question nobody has named yet is
-- present rather than lost — the same bargain the importer makes.
-- ---------------------------------------------------------------------------
drop view if exists public.feedback_report;

create view public.feedback_report as
select
  f.ucn                                              as "UC Number",
  f.entry_at                                         as "Date",
  f.visit_at                                         as "Visit Date",
  f.call_number                                      as "Call Number",
  f.call_type                                        as "Call Type",
  f.party_name                                       as "Customer",
  f.state                                            as "State",
  f.product_name                                     as "Product",
  f.serial                                           as "Serial No",
  f.engineer                                         as "Visiting Service Engineer",
  f.complaint                                        as "Complaint",
  -- ---- asked of every visit -------------------------------------------------
  f.answers->>'INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment'
                                                     as "Operating Feasibility",
  f.answers->>'INSTALLATION/PM/FIELD-In general, support of our company for your requirements'
                                                     as "General Support",
  -- ---- a PM or field visit --------------------------------------------------
  f.answers->>'PM/FIELD-Ability of our Product to meet your requirement'
                                                     as "Product Meets Requirement",
  f.answers->>'PM/FIELD-Reliability of Product'      as "Reliability of Product",
  f.answers->>'PM/FIELD-Reliability of Service'      as "Reliability of Service",
  f.answers->>'PM/FIELD-Promptness for Service Calls' as "Promptness for Service Calls",
  -- ---- an installation ------------------------------------------------------
  f.answers->>'INSTALLATION-Startup, Training and Handing Over'
                                                     as "Startup, Training and Handover",
  f.answers->>'INSTALLATION-Packing and Forwarding'  as "Packing and Forwarding",
  f.answers->>'INSTALLATION-Delivery adherence schedule'
                                                     as "Delivery Adherence",
  f.answers->>'Warranty Start Date?'                 as "Warranty Start Date?",
  -- ---- and the rest ---------------------------------------------------------
  f.answers->>'Advance PM Done?'                     as "Advance PM Done?",
  f.answers->>'INSTALLATION/PM/FIELD-Remarks if any' as "Remarks",
  f.engineer_email                                   as "Engineer Email",
  -- WHERE IT CAME FROM (0190). A figure drawn from both has to report the
  -- split; a report that cannot say which rows were migrated cannot.
  case when coalesce(btrim(f.imported_from), '') = '' then 'Entered here' else 'Uploaded' end
                                                     as "Source",
  f.imported_from                                    as "Loaded From",
  f.created_at                                       as "Loaded On",
  f.answers                                          as "All Answers"
  from public.feedback f;

alter view public.feedback_report set (security_invoker = on);
grant select on public.feedback_report to authenticated;

comment on view public.feedback_report is
  'One row per customer feedback, with the export''s own questions as named columns. A blank on a question is "not asked of that kind of visit", not a missing answer. security_invoker, so it shows a reader exactly the feedback they may see.';
