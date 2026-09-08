-- ===========================================================================
-- THE CONSUMPTION REPORT — one row per spare booked, with its call around it.
--
-- The user, 2026-09-08, with a screenshot of the sheet they keep by hand: "i
-- need the attached format for consumption report. add all the additional
-- column present in the consumption table to the end. add a provision for the
-- user to add filter before downloading and also the user should be able to
-- select the required column -- whatever is in screenshot has to be there
-- ( Mandatory Columns) rest the user can add or remove."
--
-- So the view is in TWO HALVES, and the order is the point:
--
--   the first sixteen  the screenshot's own columns, in its own order. The page
--                      will not let these be turned off -- they are what makes
--                      the file the report somebody already recognises.
--   everything after   every remaining column of `spare_consumption`, appended.
--                      Off by default, there to be switched on.
--
-- A LINE IS NOT A VISIT. `spare_consumption` is keyed on the UCN and the call
-- number; it carries no reference to the visit that used the part. The two date
-- columns the screenshot asks for therefore come from the call's LATEST visit
-- (`updated_at` is when the register was told, `visit_at` when the engineer was
-- actually there -- the same two dates the reliability export carries, and they
-- disagree often enough to be worth both). Where a call has no visit yet, both
-- are blank rather than guessed.
--
-- `part` IS "CODE|Description" -- one string, the same one the Part Master and a
-- hand-stock line use. The screenshot splits it across two columns ("Spares
-- Used" holds MP-010, "Part name" holds OXYGEN SENSOR-Envitec-...), so the view
-- splits it once, here, rather than in every consumer.
--
-- THE ENGINEER: the consumption line's own, falling back to the visit's. The
-- line is written by whoever booked the part, which is the visiting engineer in
-- every ordinary case; the fallback covers a line reconciled later by the Spare
-- Coordinator, where the visit still knows who was there.
--
-- SECURITY INVOKER, so a reader sees only the calls their role allows -- the
-- rule this project has been bitten by three times (0040, 0050, 0057). A report
-- is exactly the kind of screen where a leak would go unnoticed.
-- ===========================================================================

drop view if exists public.consumption_report;

create view public.consumption_report as
with last_visit as (
  -- The LATEST entry, not the latest visit date: a call's state comes from the
  -- last thing somebody wrote, which is `sync_call_last_visit()`'s ordering in
  -- 0032 and has to stay the same here.
  select distinct on (ucn) ucn, visit_at, updated_at, engineer
    from public.reports
   order by ucn, updated_at desc, id desc
)
select
  -- ---- the sixteen the screenshot asks for, in its order --------------------
  sc.ucn                                             as "UC Number",
  sc.call_number                                     as "Call Number",
  c.call_type                                        as "Call Type",
  v.updated_at                                       as "Visit Entry Date",
  v.visit_at                                         as "Visit Date & Time",
  coalesce(nullif(btrim(sc.engineer), ''), v.engineer, '')
                                                     as "Visiting Service Engineer",
  -- `part` is "CODE|Description"; split once here so no consumer has to.
  btrim(split_part(sc.part, '|', 1))                 as "Spares Used",
  btrim(substr(sc.part, strpos(sc.part, '|') + 1))   as "Part name",
  sc.qty                                             as "QTY",
  c.product_name                                     as "Product",
  c.serial                                           as "Serial No",
  c.party_name                                       as "Customer",
  c.city                                             as "City",
  c.standard_complaint                               as "Complaint",
  c.item_status                                      as "Item Status",
  c.reg_date                                         as "Call Date",
  -- ---- then every other column of spare_consumption -------------------------
  sc.id                                              as "Line ID",
  sc.part                                            as "Part (code|description)",
  sc.source                                          as "Source",
  sc.remarks                                         as "Remarks",
  sc.recorded_by                                     as "Recorded By",
  sc.engineer_email                                  as "Engineer Email",
  sc.original_qty                                    as "Original Qty",
  sc.adjusted_by                                     as "Adjusted By",
  sc.adjusted_at                                     as "Adjusted At",
  sc.adjustment_reason                               as "Adjustment Reason",
  sc.grir                                            as "GRIR",
  sc.source_ref                                      as "Source Ref",
  sc.source_ref_key                                  as "Source Ref Key",
  sc.created_at                                      as "Created At",
  sc.created_by                                      as "Created By",
  sc.data                                            as "Extra (import)",
  -- ---- and the call's, for filtering and for anyone who wants them ----------
  c.complaint_reported                               as "Nature of Complaint",
  c.state                                            as "State",
  c.allocated_to                                     as "Allocated To",
  c.open_state                                       as "Call Status",
  c.warranty_number                                  as "Warranty No",
  c.contract_number                                  as "Contract No",
  c.contract_type                                    as "Contract Type"
  from public.spare_consumption sc
  left join public.calls c    on c.ucn = sc.ucn
  left join last_visit v      on v.ucn = sc.ucn;

alter view public.consumption_report set (security_invoker = on);

grant select on public.consumption_report to authenticated;

comment on view public.consumption_report is
  'One row per spare booked, with its call and that call''s latest visit around it. The first sixteen columns are the user''s own report format, in their order; everything after is the rest of spare_consumption plus the call fields worth filtering on. `part` is split into code and description here so no consumer repeats it. security_invoker, so a reader sees only the calls their role allows.';
