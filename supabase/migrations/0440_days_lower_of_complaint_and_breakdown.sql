-- ===========================================================================
-- 0440 -- EVERY DAY COUNT IS THE LOWER OF COMPLAINT-TO AND BREAKDOWN-TO (the
-- user, 2026-10-14: "For the Time Taken for Attending and Solved - Basically
-- all Aging -- I want it to Calculate both Complaint to Visit / Solved Date,
-- Breakdown to Visit / Solved Date - And which ever is lower should be
-- considered. If the value is going in negative, then take the other date").
--
-- Settled with the user the same day, for the register's Aging, the KPI
-- export, the objectives and the Dashboard SLA alike:
--
--   * count END - Complaint Date and END - Breakdown Date;
--   * keep the LOWER of the two that is not negative;
--   * both negative -> 0 (never negative, as the workbook was);
--   * a call with only one of the two dates counts from that one; with
--     neither, from its registration day;
--   * NULL when END is NULL -- the thing has not happened.
--
-- call_days() is that rule, once. It replaces 0437's single `counts_from`
-- (the Breakdown Date), because the start now depends on the END: a visit
-- the day before the complaint counts from the breakdown, a visit after it
-- from the complaint. The client's copy is callDays() in src/lib/aging.ts;
-- check:ui compares the two on the same cases.
--
-- The KPI view is RESTATED FROM 0437 apart from those expressions;
-- security_invoker re-asserted because create-or-replace drops it.
-- ===========================================================================

create or replace function public.call_days(p_complaint date, p_breakdown date, p_registered date, p_on date)
returns integer language sql immutable set search_path = public as $$
  select case
    when p_on is null then null
    when p_complaint is null and p_breakdown is null then
      case when p_registered is null then null else greatest(p_on - p_registered, 0) end
    else coalesce((select min(d) from (values (p_on - p_complaint), (p_on - p_breakdown)) v(d) where d >= 0), 0)
  end
$$;
grant execute on function public.call_days(date, date, date, date) to authenticated;
comment on function public.call_days(date, date, date, date) is
  'Days from a call''s start to p_on: the lower of p_on - complaint and p_on - breakdown that is not negative; 0 when both are negative; from the registration day where the call has neither date; NULL when p_on is NULL (0440). The client''s copy is callDays() in src/lib/aging.ts.';

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
  union all
  -- PM CALLS TOO (0390, the user 2026-10-06: "In KPI Export - KPI workbook --
  -- Field_INST; Add PM Calls also"). The same columns and the same rules;
  -- cancelled PM calls are left out like every other cancelled call.
  select ucn, call_number, reg_at, reg_date, complaint_date, party_name, city, state,
         product_name, serial, item_status, warranty_number, warranty_start, warranty_end,
         contract_number, contract_start, contract_end, contract_type, call_type,
         standard_complaint, complaint_reported, allocated_to, breakdown_date
    from public.pm_calls where cancelled_at is null
),
r as (
  select
    c.*,
    l.call_status, l.pending_reason, l.engineer,
    -- INDIA DATES (0425, D-169): a date taken straight off a timestamptz is
    -- the session's day, UTC on the live project, and a visit stored at
    -- 00:00 IST is the day before there.
    (s.visit_at at time zone 'Asia/Kolkata')::date  as solved_on,
    least((fv.at at time zone 'Asia/Kolkata')::date,
          public.call_first_spare_on(c.ucn))      as attended_on,
    -- The registration day, India's: what the day counts fall back to where a
    -- call has neither a complaint nor a breakdown date (0440).
    coalesce((c.reg_at at time zone 'Asia/Kolkata')::date, c.reg_date) as reg_day,
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
    -- THE FIRST SPARE REQUEST comes from call_first_spare_on() (0424), the
    -- one the call registers use: it counts a request whoever raised it, for
    -- any reader who may see the call. Read here through spare_requests'
    -- own per-engineer policy, an engineer's export dated a re-allotted call
    -- later than their manager's, and later than their own register. The
    -- function keeps the blank-ucn guard and India's day.
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
  -- THE LOWER OF COMPLAINT -> AND BREAKDOWN -> (0440, the user 2026-10-14):
  -- call_days() takes both counts, keeps the lower one that is not negative,
  -- and is 0 when both are; NULL when the thing has not happened.
  public.call_days(r.complaint_date, r.breakdown_date, r.reg_day, r.attended_on) as "Attended in Days",
  public.call_days(r.complaint_date, r.breakdown_date, r.reg_day, r.solved_on)   as "Solved in Days",
  public.kpi_days_band(
    public.call_days(r.complaint_date, r.breakdown_date, r.reg_day, r.attended_on)) as "TTA ( R )",
  public.kpi_days_band(
    public.call_days(r.complaint_date, r.breakdown_date, r.reg_day, r.solved_on))   as "TTS ( R )",
  to_char(coalesce(r.reg_at at time zone 'Asia/Kolkata', r.reg_date::timestamp), 'YYYY Mon') as "Failure Month",
  -- The column the workbook does not have. How long an OPEN call has been
  -- waiting, today — the question the sheet answered with a 0 that read as
  -- "attended and solved the same day".
  case when r.status_now ilike 'solved%' then null
       else public.call_days(r.complaint_date, r.breakdown_date, r.reg_day, (now() at time zone 'Asia/Kolkata')::date)
  end                                            as "Pending Days"
  from r;

-- RE-ASSERTED, because create-or-replace drops it. Without this the export
-- reads as the view's OWNER and every signed-in user gets every call —
-- silently, with no error. Three times in this project (0040, 0050, 0057).
alter view public.kpi_field_inst set (security_invoker = on);
grant select on public.kpi_field_inst to authenticated;

comment on view public.kpi_field_inst is
  'The KPI workbook''s Field_INST tab, columns A-AG, for Field, Installation and PM calls (PM since 0390); every date an India date and the first spare request read by call_first_spare_on() (0425); every day count is the lower of complaint-to and breakdown-to that is not negative (call_days(), 0440). The per-call lookups into reports and spare_requests are LATERAL so the caller''s date range narrows the calls FIRST — pre-aggregating the whole of reports made a 455-call export scan 55,000 visits three times, which under RLS re-ran the call-visibility stack per row and timed out (0159).';
