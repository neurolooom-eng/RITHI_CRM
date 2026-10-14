-- ===========================================================================
-- 0435 -- A CALL REGISTERED FROM A REQUEST: COMPLAINT DATE = THE DAY THE
-- REQUEST WAS RAISED, BREAKDOWN DATE = THE DAY IT WAS ATTENDED (the user,
-- 2026-10-14: "Complaint Date should capture the Registration Request Date.
-- Break Down date should capture the Attended Date from the Registration
-- Request"; asked, existing calls corrected too).
--
-- Until now both took ONE day: the attended date where the request said it
-- was attended, else the day it was raised (callDateFromRequest(), 2026-09-05).
-- Pending Registrations fills the two apart from v0.10.191; this restates the
-- calls already registered, by the same rule:
--
--   complaint_date  the request's submitted_at, as an India date;
--   breakdown_date  its attended_date where the request says it was attended
--                   (call_attended Yes), else that same raised day -- the
--                   client's rule, word for word, so a call registered today
--                   and one corrected here agree.
--
-- ONLY A CALL WITH EXACTLY ONE REQUEST. Measured on the live project the same
-- day: 4,596 calls are linked to a request, and 150 of them to more than one.
-- Which request's dates belong to such a call is not something to guess, so
-- they are left exactly as they are; supabase/apply/_calls_with_several_
-- requests.sql lists them, each request with its dates.
--
-- Written as the table owner with no signed-in user, so the edit-section guard
-- lets it through and the audit records it as one bulk event per table.
-- ===========================================================================

do $restate$
declare t text; n bigint; total_c bigint := 0;
begin
  if to_regclass('public.call_requests') is null then return; end if;
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    continue when to_regclass('public.' || t) is null;
    execute format($q$
      with one as (
        select r.ucn,
               (r.submitted_at at time zone 'Asia/Kolkata')::date as raised,
               case when lower(btrim(coalesce(r.call_attended, ''))) in ('y', 'yes', 'true', '1', 'attended')
                         and r.attended_date is not null
                    then r.attended_date end as attended
          from public.call_requests r
         where coalesce(btrim(r.ucn), '') <> ''
           and r.submitted_at is not null
           and (select count(*) from public.call_requests r2 where r2.ucn = r.ucn) = 1
      )
      update public.%I c
         set complaint_date = one.raised,
             breakdown_date = coalesce(one.attended, one.raised)
        from one
       where one.ucn = c.ucn
         and (c.complaint_date is distinct from one.raised
              or c.breakdown_date is distinct from coalesce(one.attended, one.raised))
      $q$, t);
    get diagnostics n = row_count;
    total_c := total_c + n;
  end loop;
  raise notice '0435: % call(s) restated from their request; calls linked to several requests are left as they were.', total_c;
end $restate$;
