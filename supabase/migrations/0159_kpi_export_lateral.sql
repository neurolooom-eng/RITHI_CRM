-- ===========================================================================
-- KPI EXPORT — the same answer, without reading the whole register to give it.
--
-- REPORTED 2026-09-10: "Sivarani is unable to download KPI Report" —
-- "Could not export: canceling statement due to statement timeout" on a range
-- holding 455 calls.
--
-- MEASURED, not guessed. Against a database seeded to the live shape (24,000
-- calls, 55,000 visits, 12,000 spare requests), one month of the export:
--
--     as superuser (RLS BYPASSED) ..........    160 ms
--     as a Hotline engineer (RLS applied) ... 27,273 ms
--
-- The 170x is the whole story, and it is why this looked fine to every check
-- that has ever been run against this view: everything here runs as the owner
-- unless somebody signs in.
--
-- WHY. The view pre-aggregated the WHOLE of `reports` and `spare_requests` in
-- four CTEs, then joined the result to the calls. Those CTEs do not depend on
-- which calls were asked for, so the caller's date range CANNOT be pushed into
-- them: exporting 455 calls scanned all 55,000 visits, three times over.
--
-- Under RLS that is not merely 55,000 rows. `reports_read` carries
-- `exists (select 1 from calls c where c.ucn = reports.ucn ...)`, and `calls` is
-- itself a VIEW over three call tables that each carry their own policy. So the
-- entire call-visibility stack was re-evaluated per report row — the plan came
-- back with more than a hundred nested SubPlans.
--
-- THE FIX IS TO CORRELATE, not to index around it. The four aggregates become
-- LATERAL lookups keyed on the call in hand, so the date range narrows the calls
-- FIRST and only those calls touch `reports` at all. The policy then runs over
-- the rows being exported instead of the register.
--
-- The semantics are unchanged, deliberately and line by line:
--   * `latest` was `distinct on (ucn) ... order by ucn, updated_at desc, id desc`
--     — the latest ENTRY, not the latest visit (0032). `order by updated_at
--     desc, id desc limit 1` on one ucn is the same row.
--   * `solved` is that, filtered to the status that completed the call.
--   * `first_visit` is min(visit_at) ignoring rows with no visit date.
--   * `first_spare` is min(coalesce(or_req_date, created_at::date)), and keeps
--     the guard that an EMPTY ucn matches nothing — without it a call with a
--     blank ucn would pick up every ucn-less spare request in the table.
--
-- REPLACED, NOT DROPPED. `create or replace` keeps the column list identical
-- (which is all it allows) and avoids the AccessExclusiveLock that made 0154
-- deadlock against the live app. And `security_invoker` is re-asserted below,
-- because create-or-replace DROPS it — the fault that has exposed every call to
-- every user three times in this project (0040, 0050, 0057).
-- ===========================================================================

-- `first_spare` looks up spare requests by ucn, and there was no index for it:
-- `spare_requests` carried indexes on uid, stage, created_at and or_no, but not
-- on the column this join uses.
--
-- PLAIN, NOT PARTIAL, and that was a real mistake worth leaving written down.
-- The first attempt was `... (ucn) where coalesce(btrim(ucn), '') <> ''`, to
-- match the guard in the lateral below. But that guard is about the OUTER row
-- (`c.ucn`), not about `spare_requests` — so Postgres could not prove the
-- partial index applied to this scan and ignored it, leaving the lookup a
-- sequential scan per call. Measured: 1.2 ms per call across 920 calls, which
-- was more than half of what was left. A partial index is only usable when its
-- predicate follows from the query's own restriction on THAT table.
create index if not exists spare_requests_ucn_idx
  on public.spare_requests (ucn);

-- min(visit_at) per call, straight off the index rather than fetching every
-- visit row for the call and then discarding the ones with no date.
create index if not exists reports_ucn_visit_idx
  on public.reports (ucn, visit_at) where visit_at is not null;

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
    -- THE LATEST ENTRY, per call. Not the latest VISIT: a report written up
    -- late is still the latest thing the register was told (0032).
    left join lateral (
      select rl.call_status, rl.pending_reason, rl.engineer
        from public.reports rl
       where rl.ucn = c.ucn
       order by rl.updated_at desc, rl.id desc
       limit 1
    ) l on true
    left join lateral (
      select rs.visit_at
        from public.reports rs
       where rs.ucn = c.ucn
         and rs.call_status ilike 'solved%report%complet%'
       order by rs.updated_at desc, rs.id desc
       limit 1
    ) s on true
    left join lateral (
      select min(rf.visit_at) as at
        from public.reports rf
       where rf.ucn = c.ucn and rf.visit_at is not null
    ) fv on true
    -- An EMPTY ucn matches nothing, which the aggregate form got for free by
    -- excluding blank ucns before grouping. Correlated, the guard has to be
    -- said out loud or a call with no ucn would collect every ucn-less request.
    left join lateral (
      select min(coalesce(sq.or_req_date, sq.created_at::date)) as on_date
        from public.spare_requests sq
       where coalesce(btrim(c.ucn), '') <> ''
         and sq.ucn = c.ucn
    ) fs on true
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

-- RE-ASSERTED, because create-or-replace drops it. Without this the export
-- reads as the view's OWNER and every signed-in user gets every call —
-- silently, with no error. Three times in this project (0040, 0050, 0057).
alter view public.kpi_field_inst set (security_invoker = on);
grant select on public.kpi_field_inst to authenticated;

comment on view public.kpi_field_inst is
  'The KPI workbook''s Field_INST tab, columns A-AG. The per-call lookups into reports and spare_requests are LATERAL so the caller''s date range narrows the calls FIRST — pre-aggregating the whole of reports made a 455-call export scan 55,000 visits three times, which under RLS re-ran the call-visibility stack per row and timed out (0159).';
