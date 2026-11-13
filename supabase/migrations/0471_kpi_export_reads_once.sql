-- ===========================================================================
-- 0471 -- KPI EXPORT: "canceling statement due to statement timeout" (the user,
-- 2026-11-13, a screenshot of Reports -> KPI Export, Field, CSV: "fix this").
--
-- The count answered (4,961 calls) and every page of the rows timed out.
-- Measured on a database of 5,000 calls, 15,000 visits and 1,667 spare
-- requests, as a signed-in administrator: 2.8 s a page, of which 1.8 s was
-- call_first_spare_on() -- asked once PER CALL, and each time re-running the
-- permission checks inside it (has_perm, can_view_all_calls, the `calls` view
-- over three registers). Every page sorts on the registration date, so every
-- page computes every call. On the live project, with more visits and the
-- heavier visibility stack, that is past the API's statement timeout.
--
-- TWO CHANGES, NO CHANGE TO ANY ANSWER:
--   * call_first_spare_dates(): the same rule as call_first_spare_on() (0424)
--     -- the first spare request of a call, whoever raised it, India's day,
--     only for a call the CALLER may see, blank UCNs ignored -- for every call
--     at once. An owner-rights function returning only a UCN and a date, the
--     visibility tests asked once per query rather than once per call.
--   * the three LATERAL reads of `reports` folded into ONE pass per call.
-- call_first_spare_on() stays: call_dates (0424) uses it a page at a time.
-- 0450's view otherwise word for word; columns identical; security_invoker
-- re-asserted because create-or-replace drops it.
-- ===========================================================================

create or replace function public.call_first_spare_dates()
returns table(ucn text, first_on date)
language sql stable security definer
set search_path = public
as $$
  select sq.ucn,
         min(coalesce(sq.or_req_date, (sq.created_at at time zone 'Asia/Kolkata')::date))
    from public.spare_requests sq
   where coalesce(btrim(sq.ucn), '') <> ''
     and (select public.has_perm('calls.view'))
     and exists (
       select 1 from public.calls c
        where c.ucn = sq.ucn
          and ((select public.can_view_all_calls())
               or c.created_by = (select auth.uid())
               or c.actual_created_by = (select auth.uid())
               or coalesce(c.allocated_to, '') = ''
               or lower(btrim(c.allocated_to)) in (select lower(btrim(v.n)) from public.visible_engineer_names() v(n))))
   group by sq.ucn
$$;
comment on function public.call_first_spare_dates() is
  'The first spare request date of every call the caller may see (0471): call_first_spare_on()''s rule (0424) for all calls at once, so the KPI export asks the permission checks once rather than per call.';
revoke execute on function public.call_first_spare_dates() from public, anon;
grant execute on function public.call_first_spare_dates() to authenticated;

create or replace view public.kpi_field_inst as
with c as (
  select ucn, call_number, reg_at, reg_date, complaint_date, party_name, city, state,
         product_name, serial, item_status, warranty_number, warranty_start, warranty_end,
         contract_number, contract_start, contract_end, contract_type, call_type,
         standard_complaint, complaint_reported, allocated_to, breakdown_date,
         'Field'::text as register
    from public.field_calls where cancelled_at is null
  union all
  select ucn, call_number, reg_at, reg_date, complaint_date, party_name, city, state,
         product_name, serial, item_status, warranty_number, warranty_start, warranty_end,
         contract_number, contract_start, contract_end, contract_type, call_type,
         standard_complaint, complaint_reported, allocated_to, breakdown_date,
         'Installation'::text as register
    from public.installation_calls where cancelled_at is null
  union all
  -- PM CALLS TOO (0390, the user 2026-10-06: "In KPI Export - KPI workbook --
  -- Field_INST; Add PM Calls also"). The same columns and the same rules;
  -- cancelled PM calls are left out like every other cancelled call.
  select ucn, call_number, reg_at, reg_date, complaint_date, party_name, city, state,
         product_name, serial, item_status, warranty_number, warranty_start, warranty_end,
         contract_number, contract_start, contract_end, contract_type, call_type,
         standard_complaint, complaint_reported, allocated_to, breakdown_date,
         'PM'::text as register
    from public.pm_calls where cancelled_at is null
),
r as (
  select
    c.*,
    v.call_status, v.pending_reason, v.engineer,
    -- INDIA DATES (0425, D-169): a date taken straight off a timestamptz is
    -- the session's day, UTC on the live project, and a visit stored at
    -- 00:00 IST is the day before there.
    (v.solved_at at time zone 'Asia/Kolkata')::date  as solved_on,
    least((v.first_at at time zone 'Asia/Kolkata')::date, fs.first_on) as attended_on,
    -- The registration day, India's: what the day counts fall back to where a
    -- call has neither a complaint nor a breakdown date (0440).
    coalesce((c.reg_at at time zone 'Asia/Kolkata')::date, c.reg_date) as reg_day,
    coalesce(nullif(btrim(v.call_status), ''), 'Unattended') as status_now
    from c
    -- ONE PASS OVER THE CALL'S VISITS (0471), where 0159-0450 made three: the
    -- LATEST ENTRY (status, pending reason, engineer -- not the latest VISIT:
    -- a report written up late is still the latest thing the register was
    -- told, 0032), the latest entry that set "Solved - Report Completed" (its
    -- visit date), and the first visit. Same rows, same order, same answers;
    -- reading `reports` under its row-level security re-checks the call's
    -- visibility per row read, so three reads were three times that.
    left join lateral (
      select (array_agg(rf.call_status    order by rf.updated_at desc, rf.id desc))[1] as call_status,
             (array_agg(rf.pending_reason order by rf.updated_at desc, rf.id desc))[1] as pending_reason,
             (array_agg(rf.engineer       order by rf.updated_at desc, rf.id desc))[1] as engineer,
             (array_agg(rf.visit_at order by rf.updated_at desc, rf.id desc)
                filter (where rf.call_status ilike 'solved%report%complet%'))[1]    as solved_at,
             min(rf.visit_at)                                                       as first_at
        from public.reports rf
       where rf.ucn = c.ucn
    ) v on true
    -- THE FIRST SPARE REQUEST, whoever raised it, for a call the reader may
    -- see (0424's rule) -- worked out ONCE for the whole export by
    -- call_first_spare_dates() (0471) and joined, where 0425 asked
    -- call_first_spare_on() once PER CALL and every call repeated the
    -- permission checks inside it. That was 1.8 s of 2.8 s a page on 5,000
    -- calls as an administrator, and the export timed out on the live project.
    left join public.call_first_spare_dates() fs on fs.ucn = c.ucn
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
  end                                            as "Pending Days",
  -- WHICH DATE EACH COUNT CAME FROM (0442, the user 2026-10-14: "In the KPI
  -- exports mention explicitly which was used for calculation. Since this
  -- carries per record"). Appended LAST, after Pending Days, so A to AG still
  -- line up with the workbook. call_days_from() is call_days()'s choice.
  public.call_days_from(r.complaint_date, r.breakdown_date, r.reg_day, r.attended_on) as "Attended Days From",
  public.call_days_from(r.complaint_date, r.breakdown_date, r.reg_day, r.solved_on)   as "Solved Days From",
  case when r.status_now ilike 'solved%' then null
       else public.call_days_from(r.complaint_date, r.breakdown_date, r.reg_day, (now() at time zone 'Asia/Kolkata')::date)
  end                                            as "Pending Days From",
  -- WHICH REGISTER THE CALL IS ON (0450, the user 2026-10-22: "In KPI Export -
  -- Add Call Type Filter"). Taken from the table the row came from, never
  -- from the Call Type text, which is spelt several ways ("P M VISIT",
  -- "PM VISIT", "INSTALLATION CALL" ...). Appended LAST; not an export column.
  r.register                                     as "Register"
  from r;

-- RE-ASSERTED, because create-or-replace drops it. Without this the export
-- reads as the view's OWNER and every signed-in user gets every call —
-- silently, with no error. Three times in this project (0040, 0050, 0057).
alter view public.kpi_field_inst set (security_invoker = on);
grant select on public.kpi_field_inst to authenticated;

comment on view public.kpi_field_inst is
  'The KPI workbook''s Field_INST tab, columns A-AG, for Field, Installation and PM calls (PM since 0390); every date an India date and the first spare request read by call_first_spare_dates() (0471; per call by call_first_spare_on() 0425-0450); every day count is the lower of complaint-to and breakdown-to that is not negative (call_days(), 0440), the three "... Days From" columns name the date each count came from (0442), and "Register" says which of the three registers the call is on (0450). The per-call lookup into reports is ONE LATERAL pass (0471; three until then) so the caller''s date range narrows the calls FIRST (0159).';
