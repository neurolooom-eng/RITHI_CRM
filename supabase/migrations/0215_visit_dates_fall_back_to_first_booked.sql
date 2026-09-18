-- ===========================================================================
-- WHERE THERE IS NO VISIT, THE REPORT SHOWS WHEN THE SPARE WAS FIRST BOOKED.
--
--   The user, 2026-09-18: "Map the first booked date to Visit Entry Date,
--   Visit Date & Time."
--
-- 0214 stopped NEW consumption being booked against a call nobody has visited.
-- It deliberately did not touch what was already there, so those rows go on
-- showing two blank columns. This fills them from the one date those rows do
-- carry: the first time a spare was booked on that call.
--
-- AND AN IMPORTED VALUE COMES BEFORE THE FALLBACK (the user, same day: "For
-- Imported Data - I need the Visit Entry Date; Visit Date & Time as in from the
-- Import"). The order is: the REAL visit, then what the FILE said, then the
-- first booking. An imported date is a recorded fact from the system the data
-- came out of; the first booking is only an approximation, so it goes last.
--
-- WHERE THE IMPORTED VALUES ACTUALLY ARE. The Consumption upload maps
-- `Visit Date & Time` straight onto `created_at` (uploads.ts), so for an
-- imported row the first-booked fallback was ALREADY surfacing it. Everything
-- the upload does not map falls into `data` keyed by the header as typed, which
-- is where `Visit Entry Date` lands — read here through `imported_ts()`, which
-- squashes case and punctuation so "VISIT_ENTRY_DATE" is the same column, and
-- returns NOTHING rather than raising on a cell holding "n/a". A bare cast
-- there would not spoil one cell: it would take the whole report down.
--
-- A FALLBACK, NEVER A REPLACEMENT. Where a visit exists its dates win, exactly
-- as before — `coalesce(v.updated_at, fb.at)`. The booking date is reached only
-- when the join found nothing, which after 0214 means a row that predates the
-- rule. The set it applies to is closed and shrinking; it cannot grow.
--
-- PER UCN, NOT PER ROW. A visit is ONE event, so every spare fitted on it has
-- to carry the same date. Using each row's own `created_at` would give three
-- different "visit dates" to three spares fitted on the same visit, which is a
-- worse answer than the blank it replaces.
--
-- SAY THIS PLAINLY, BECAUSE THE COLUMN HEADING DOES NOT: a booking date is not
-- a visit date. It is the closest thing on the record and it is usually the
-- same day, but a spare reconciled a week later carries the reconciliation's
-- date under a heading that says "Visit". Anyone auditing a visit date from
-- this report on a pre-0214 row should read it as "no later than", not as "on".
-- `_consumption_without_a_visit.sql` lists exactly which rows those are, which
-- is the honest way to tell the two apart.
--
-- `create or replace` KEEPS THE COLUMN LIST IDENTICAL — only two expressions
-- change — so nothing that selects from this view has to be rebuilt. It DROPS
-- `security_invoker`, which is re-asserted below: without it the view reads as
-- its owner and row-level security stops applying to whoever is reading, with
-- no error and no warning.
-- ===========================================================================

-- A TIMESTAMP OUT OF AN IMPORTED CELL, or nothing.
--
-- The value came from somebody's spreadsheet, so it can be anything: a real
-- date, a dash, a note, an empty string. A bare `::timestamptz` on that would
-- not spoil one cell -- it would raise, and the WHOLE REPORT would fail to
-- read. Returning null lets the coalesce below fall through to the next
-- candidate, which is the behaviour a blank cell should have anyway.
--
-- The key is matched with its punctuation and case squashed, because the header
-- in the file is whatever somebody typed: "Visit Entry Date", "VISIT ENTRY
-- DATE" and "Visit_Entry_Date" are one column.
create or replace function public.imported_ts(payload jsonb, want text)
returns timestamptz
language plpgsql
immutable
as $$
declare k text; v text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then return null; end if;
  for k in select jsonb_object_keys(payload) loop
    if regexp_replace(lower(k), '[^a-z0-9]', '', 'g')
       = regexp_replace(lower(want), '[^a-z0-9]', '', 'g') then
      v := btrim(coalesce(payload ->> k, ''));
      if v = '' then return null; end if;
      begin
        return v::timestamptz;
      exception when others then
        return null;
      end;
    end if;
  end loop;
  return null;
end $$;

create or replace view public.consumption_report as
with first_booked as (
  -- THE FIRST TIME A SPARE WAS BOOKED ON THIS CALL. Per UCN, not per row: a
  -- visit is ONE event, so every spare fitted on it must carry the same date —
  -- using each row's own created_at would give three "visit dates" to three
  -- spares fitted on one visit.
  select ucn, min(created_at) as at
    from public.spare_consumption
   where coalesce(btrim(ucn), '') <> ''
   group by ucn
),
last_visit as (
  -- The LATEST entry, not the latest visit date: a call's state comes from the
  -- last thing somebody wrote, which is `sync_call_last_visit()`'s ordering in
  -- 0032 and has to stay the same here.
  select distinct on (ucn) ucn, uid, visit_at, updated_at, engineer
    from public.reports
   order by ucn, updated_at desc, id desc
)
select
  -- ---- the sixteen the screenshot asks for, in its order --------------------
  sc.ucn                                             as "UC Number",
  sc.call_number                                     as "Call Number",
  c.call_type                                        as "Call Type",
  coalesce(v.updated_at,
           public.imported_ts(sc.data, 'Visit Entry Date'),
           fb.at)                                    as "Visit Entry Date",
  coalesce(v.visit_at,
           public.imported_ts(sc.data, 'Visit Date & Time'),
           fb.at)                                    as "Visit Date & Time",
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
  c.contract_type                                    as "Contract Type",
  -- ---- and the visit this spare belongs to ---------------------------------
  -- The user, 2026-09-18: "Give me the UID in Consumption Report." The row's
  -- own id is already here as "Line ID", so the one that adds something is the
  -- VISIT's — `reports.uid` — which ties each spare to the visit record its
  -- dates come from. APPENDED at the end because `create or replace view` can
  -- only add columns, and only after the existing ones; inserting it beside the
  -- visit dates would need a drop, and everything selecting from this view
  -- rebuilt with it.
  -- Empty on the pre-0214 rows, for the same reason their dates were: there is
  -- no visit. Their dates now fall back to the first booking, but a UID cannot
  -- be invented, so it stays blank — which is the honest difference between a
  -- date we can approximate and an identifier we cannot.
  v.uid                                              as "Visit UID"
  from public.spare_consumption sc
  left join public.calls c    on c.ucn = sc.ucn
  left join last_visit v      on v.ucn = sc.ucn
  left join first_booked fb   on fb.ucn = sc.ucn;
-- RE-ASSERTED. `create or replace view` drops it, every time.
alter view public.consumption_report set (security_invoker = on);
