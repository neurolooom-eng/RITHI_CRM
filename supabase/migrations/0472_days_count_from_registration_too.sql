-- ===========================================================================
-- 0472 -- EVERY DAY COUNT ALSO COUNTS FROM THE REGISTRATION DATE (the user,
-- 2026-11-13: "In Objective - Problem Call attending within 3 days - For 'TTA
-- Counted From' Include Call Registration Date As well. At the Moment it is
-- only Complaint Date and Breakdown Date - Convert the Call Registration Date
-- from DateTime to Date and Use it for Calculation.")
--
-- Asked, the user chose:
--   * THE LOWEST OF THE THREE that is not negative: complaint-to, breakdown-to
--     and registration-to the day (0440's rule with a third candidate). 0 when
--     all three are negative; no count when the call has none of the dates.
--   * EVERYWHERE: every attended, solved and pending count -- the objectives,
--     their evidence and the KPI Export -- since all of them read these two
--     functions.
--
-- THE REGISTRATION DATE IS INDIA'S DAY OF THE REGISTRATION TIME: every caller
-- already passes coalesce((reg_at at time zone 'Asia/Kolkata')::date,
-- reg_date) as p_registered (0425, 0441, 0443), so the date-time becomes a
-- date before it is counted. Until now it was used only when a call had
-- neither a complaint nor a breakdown date; that case answers as before.
--
-- call_days_from() names the date the count came from: Complaint, Breakdown or
-- Registration Date, a tie of them ("Complaint & Registration Date",
-- "Complaint, Breakdown & Registration Date"), or "None -- all after (0)"
-- where every candidate is after the day (0442's "Neither -- both after (0)").
-- The client copy of the rule is callDays() in src/lib/aging.ts; check:ui
-- holds the two to the same cases.
-- ===========================================================================

create or replace function public.call_days(p_complaint date, p_breakdown date, p_registered date, p_on date)
returns integer
language sql immutable
set search_path = public
as $$
  select case
    when p_on is null then null
    when p_complaint is null and p_breakdown is null and p_registered is null then null
    else coalesce((select min(d) from (values (p_on - p_complaint), (p_on - p_breakdown), (p_on - p_registered)) v(d)
                    where d >= 0), 0)
  end
$$;
comment on function public.call_days(date, date, date, date) is
  'Days to p_on: the LOWEST of complaint-to, breakdown-to and registration-to (India''s day) that is not negative; 0 when all are negative; null with no date or no p_on (0472; 0440 had complaint and breakdown only).';

create or replace function public.call_days_from(p_complaint date, p_breakdown date, p_registered date, p_on date)
returns text
language sql immutable
set search_path = public
as $$
  with v(ord, name, d) as (
    values (1, 'Complaint', p_on - p_complaint), (2, 'Breakdown', p_on - p_breakdown), (3, 'Registration', p_on - p_registered)
  ),
  ok as (select * from v where d >= 0),
  best as (select ord, name from ok where d = (select min(d) from ok))
  select case
    when p_on is null then null
    when not exists (select 1 from v where d is not null) then null
    when not exists (select 1 from ok) then 'None -- all after (0)'
    else (select case count(*)
                   when 1 then max(name)
                   when 2 then min(name) filter (where ord = (select min(ord) from best)) || ' & '
                               || max(name) filter (where ord = (select max(ord) from best))
                   else 'Complaint, Breakdown & Registration'
                 end from best) || ' Date'
  end
$$;
comment on function public.call_days_from(date, date, date, date) is
  'Which date call_days() counted from: Complaint, Breakdown or Registration Date, a tie of them, or "None -- all after (0)" (0472).';
