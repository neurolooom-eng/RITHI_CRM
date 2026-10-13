-- ===========================================================================
-- 0424 -- FIRST ATTENDED, LAST VISIT AND SOLVED DATES ON EVERY CALL (the user,
-- 2026-10-13: "Add call attended date (First Attended Date), Last Visit Date,
-- Solved Date - in Field / PM / Installation Call").
--
-- Settled with the user the same day, so the three agree with the KPI
-- Field_INST tab (0128 / 0390) and the "attended within N days" objective:
--
--   first_attended_on  the EARLIER of the first visit's date and the first
--                      spare request's date (or_req_date, else the day the
--                      request was written);
--   last_visit_on      the date of the most recent visit (the latest Visit
--                      Date & Time on the call);
--   solved_on          the visit date of the entry that set "Solved - Report
--                      Completed" -- the latest such entry, so a call solved
--                      twice shows the solve that is standing.
--
-- EVERY DATE IS AN INDIA DATE (D-168): `::date` on a timestamptz takes the
-- session's zone, UTC on the live project, and 29,970 of 31,262 visits are
-- stored at 00:00 IST -- a bare cast would date nearly all of them a day early.
--
-- READ, NOT STORED. call_dates is a view over `calls`, security_invoker, so it
-- has a row exactly for the calls the reader may see and nothing to keep in
-- step. Visits come from `reports`, whose read policy follows the call's.
-- Spare requests do NOT: sr_read is per engineer, so a call re-allotted to
-- somebody new would show them a later first-attended date than their manager
-- sees. call_first_spare_on() therefore reads spare_requests as its owner and
-- answers only for a call the CALLER may see -- the calls_scoped_read rule,
-- restated -- and returns nothing but a date.
-- ===========================================================================

create or replace function public.call_first_spare_on(p_ucn text)
returns date language sql stable security definer set search_path = public as $$
  select min(coalesce(sq.or_req_date, (sq.created_at at time zone 'Asia/Kolkata')::date))
    from public.spare_requests sq
   where coalesce(btrim(p_ucn), '') <> ''
     and sq.ucn = p_ucn
     and exists (
       select 1 from public.calls c
        where c.ucn = p_ucn
          and (select public.has_perm('calls.view'))
          and ((select public.can_view_all_calls())
               or c.created_by = (select auth.uid())
               or c.actual_created_by = (select auth.uid())
               or coalesce(c.allocated_to, '') = ''
               or lower(btrim(c.allocated_to)) in (select lower(btrim(v.n)) from public.visible_engineer_names() v(n))))
$$;
revoke execute on function public.call_first_spare_on(text) from public, anon;
grant execute on function public.call_first_spare_on(text) to authenticated;
comment on function public.call_first_spare_on(text) is
  'The first spare request''s date on a call (or_req_date, else its India creation date), for a call the caller may see; NULL otherwise. Read by call_dates (0424).';

create or replace view public.call_dates as
select c.ucn,
       least(v.first_visit_on, public.call_first_spare_on(c.ucn)) as first_attended_on,
       v.last_visit_on,
       s.solved_on
  from public.calls c
  left join lateral (
    select min((r.visit_at at time zone 'Asia/Kolkata')::date) as first_visit_on,
           max((r.visit_at at time zone 'Asia/Kolkata')::date) as last_visit_on
      from public.reports r
     where r.ucn = c.ucn and r.visit_at is not null
  ) v on true
  left join lateral (
    select (rs.visit_at at time zone 'Asia/Kolkata')::date as solved_on
      from public.reports rs
     where rs.ucn = c.ucn and rs.call_status ilike 'solved%report%complet%'
     order by rs.updated_at desc nulls last, rs.id desc
     limit 1
  ) s on true;

-- `create or replace view` drops security_invoker; without it the view reads
-- as its owner and every signed-in user sees every call's dates.
alter view public.call_dates set (security_invoker = on);
grant select on public.call_dates to authenticated;

comment on view public.call_dates is
  'Per call: First Attended (earlier of first visit and first spare request), Last Visit and Solved (visit date of the standing Solved - Report Completed entry), all India dates (0424). security_invoker: one row per call the reader may see.';
