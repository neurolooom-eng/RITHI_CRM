-- ===========================================================================
-- PHASE 2 — the five computed columns, and the one the workbook does not have.
--
-- The formulas are the workbook's own, read out of the file rather than
-- guessed, and confirmed against its own cached answers:
--
--   AC Attended in Days = IF(MIN(attended-complaint, attended-registered) < 0,
--                            0, that MIN)
--   AD Solved in Days   = the same, from the solved date
--   AE TTA (R)          = VLOOKUP(AC, band table)
--   AF TTS (R)          = VLOOKUP(AD, band table)
--   AG Failure Month    = TEXT(registration date, "YYYY MMM")
--
-- MIN of the two differences means the count runs from the LATER of the
-- complaint and the registration. A call complained about on the 30th and
-- registered on the 3rd of the next month, attended on the 30th, is 0 days —
-- not -4 and not 12.
--
-- THE FOUR DECISIONS (user, 2026-09-07), each of which the sheet answers
-- differently or not at all:
--
--  1. AN UNATTENDED CALL GETS PENDING DAYS, IN A COLUMN OF ITS OWN. The sheet
--     computes AC and AD for a call nobody has been to and gets 0 — Excel reads
--     a blank date as zero — so every unattended call in the file reads
--     "attended and solved the same day, 00-03D", and is counted in the bands.
--     Here those two stay NULL and `Pending Days` says how long it has actually
--     been waiting. Computed for every OPEN call, not only Unattended: a call
--     left Unsolved for 200 days is the same question being asked.
--
--  2. THE FINER BANDS. LOOKUPVALUES holds two tables; Field_INST used the
--     coarse one for both, so a machine open eleven months read the same as one
--     open sixty-one days. Both TTA and TTS now use the finer bands, which are
--     the same up to 60 days and then keep going: 61-90D, 91-180D, >180D,
--     >1 yr, >2 yrs, >3 yrs, >4 yrs, >5 yrs.
--
--  3. SOLVED - REPORT PENDING IS **CLOSE**, per the sheet's own lookup. This
--     REVERSES 0128, where it was Open on the user's earlier instruction. The
--     solved DATE is unchanged — it is still the visit that reached Solved -
--     Report Completed — so a report-pending call is Close with no solved date
--     and therefore no Solved in Days. That is what the workbook shows too.
--
--  4. FAILURE MONTH IS OFF THE REGISTRATION DATE, not the complaint date, as
--     the formula has it.
--
-- Cancelled calls are still excluded from the view entirely (0128): that is
-- about which rows exist at all, not about Open and Close.
-- ===========================================================================

-- The band table, as a function so it is written once and both columns use it.
-- The bounds are LOOKUPVALUES!H:L, which is the finer of the two.
create or replace function public.kpi_days_band(p_days integer)
returns text language sql immutable as $$
  select case
    when p_days is null then null
    when p_days <    0 then '00-03D'      -- the sheet's -300..-1 row; floored anyway
    when p_days <=   3 then '00-03D'
    when p_days <=   7 then '04-07D'
    when p_days <=  30 then '08-30D'
    when p_days <=  60 then '31-60D'
    when p_days <=  90 then '61-90D'
    when p_days <= 180 then '91-180D'
    when p_days <= 365 then '>180D'
    when p_days <= 730 then '>1 yr'
    when p_days <= 1080 then '>2 yrs'
    when p_days <= 1460 then '>3 yrs'
    when p_days <= 1825 then '>4 yrs'
    else '>5 yrs'
  end;
$$;
comment on function public.kpi_days_band(integer) is
  'The KPI workbook''s TTA / TTS band for a day count, using LOOKUPVALUES''s FINER table (H:L) — the same as the coarse one to 60 days, then 61-90D, 91-180D, >180D, >1 yr … >5 yrs.';

-- Dropped first for the same reason 0128 is: whichever of the two runs last
-- must not be constrained by the shape the other left behind.
drop view if exists public.kpi_field_inst;
create view public.kpi_field_inst as
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
latest as (
  select distinct on (ucn) ucn, call_status, pending_reason, engineer
    from public.reports order by ucn, updated_at desc, id desc
),
solved as (
  select distinct on (ucn) ucn, visit_at
    from public.reports
   where call_status ilike 'solved%report%complet%'
   order by ucn, updated_at desc, id desc
),
first_visit as (
  select ucn, min(visit_at) as at from public.reports where visit_at is not null group by ucn
),
first_spare as (
  select ucn, min(coalesce(or_req_date, created_at::date)) as on_date
    from public.spare_requests
   where coalesce(btrim(ucn), '') <> ''
   group by ucn
),
r as (
  select
    c.*,
    l.call_status, l.pending_reason, l.engineer,
    s.visit_at::date                              as solved_on,
    least(fv.at::date, fs.on_date)                as attended_on,
    -- The count runs from the LATER of complaint and registration: MIN of the
    -- two differences is the same thing said the workbook's way.
    greatest(c.complaint_date, coalesce(c.reg_at::date, c.reg_date))
                                                  as counts_from,
    coalesce(nullif(btrim(l.call_status), ''), 'Unattended') as status_now
    from c
    left join latest      l  on l.ucn  = c.ucn
    left join solved      s  on s.ucn  = c.ucn
    left join first_visit fv on fv.ucn = c.ucn
    left join first_spare fs on fs.ucn = c.ucn
)
select
  r.ucn                                          as "UC Number",
  r.call_number                                  as "Call Number",
  coalesce(r.reg_at, r.reg_date::timestamptz)    as "Call Registeration Date",
  r.complaint_date                               as "Complaint Date",
  r.party_name                                   as "Party Name",
  r.city                                         as "City",
  r.state                                        as "State",
  r.product_name                                 as "Product Name",
  r.serial                                       as "Product Serial Number",
  r.item_status                                  as "Item Status",
  r.warranty_number                              as "Warranty Number",
  r.warranty_start                               as "Warranty Start Date",
  r.warranty_end                                 as "Warranty End Date",
  r.contract_number                              as "Contract Number",
  r.contract_start                               as "Contract Start Date",
  r.contract_end                                 as "Contract End Date",
  r.contract_type                                as "Contract Type",
  r.call_type                                    as "Call Type",
  r.standard_complaint                           as "Standard Complaint",
  r.complaint_reported                           as "Complaint Reported",
  r.allocated_to                                 as "Call Allocated To",
  r.breakdown_date                               as "Breakdown Date",
  -- DECISION 3: any Solved... status is Close, report-pending included.
  case when r.status_now ilike 'solved%' then 'Close' else 'Open' end
                                                 as "Open/Close",
  r.status_now                                   as "Call Status",
  coalesce(r.pending_reason, '')                 as "CALL PENDING REASON",
  coalesce(r.engineer, '')                       as "Visiting Service Engineer",
  r.attended_on                                  as "Call Attended On",
  r.solved_on                                    as "Call Solved Date & Time",
  -- AC / AD. NULL when the thing being measured has not happened, rather than
  -- the sheet's 0 — see decision 1.
  --
  -- THE GUARD IS NOT DECORATION. `greatest()` IGNORES NULLs in Postgres, so
  -- `greatest(null - date, 0)` is 0, not null — and an unattended call would
  -- read "attended in 0 days, 00-03D", which is precisely the sheet behaviour
  -- this decision exists to undo. Caught by test 10, which was written for it.
  -- (It is the same property `least()` has, and there it is what we want: see
  -- Call Attended On in 0128.)
  case when r.attended_on is null or r.counts_from is null then null
       else greatest((r.attended_on - r.counts_from)::int, 0) end as "Attended in Days",
  case when r.solved_on is null or r.counts_from is null then null
       else greatest((r.solved_on - r.counts_from)::int, 0) end   as "Solved in Days",
  public.kpi_days_band(
    case when r.attended_on is null or r.counts_from is null then null
         else greatest((r.attended_on - r.counts_from)::int, 0) end)      as "TTA ( R )",
  public.kpi_days_band(
    case when r.solved_on is null or r.counts_from is null then null
         else greatest((r.solved_on - r.counts_from)::int, 0) end)        as "TTS ( R )",
  to_char(coalesce(r.reg_at, r.reg_date::timestamptz), 'YYYY Mon')        as "Failure Month",
  -- The column the workbook does not have. How long an OPEN call has been
  -- waiting, today — the question the sheet answered with a 0 that read as
  -- "attended and solved the same day".
  case when r.status_now ilike 'solved%' or r.counts_from is null then null
       else greatest(((now() at time zone 'Asia/Kolkata')::date - r.counts_from)::int, 0)
  end                                            as "Pending Days"
  from r;

alter view public.kpi_field_inst set (security_invoker = on);
grant select on public.kpi_field_inst to authenticated;

comment on view public.kpi_field_inst is
  'The KPI workbook''s Field_INST tab from the register: A-AB as the sheet has them, AC-AG computed by its own formulas, plus Pending Days for a call still open. Cancelled calls excluded entirely. Close is any Solved... status, report-pending included. A day count is NULL where the event has not happened, never 0.';
