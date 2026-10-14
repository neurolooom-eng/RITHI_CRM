-- ===========================================================================
-- READ-ONLY. Calls linked to MORE THAN ONE registration request -- the ones
-- 0435 left alone, because which request's dates belong to the call is the
-- user's decision, not a guess. One row per request, grouped by call: the
-- call's dates now, and each request's raised and attended dates.
-- ===========================================================================
select c.ucn                                              as "UC Number",
       c.call_type                                        as "Call Type",
       c.complaint_date                                   as "Complaint Date (now)",
       c.breakdown_date                                   as "Breakdown Date (now)",
       r.reqid                                            as "Request",
       r.status                                           as "Request Status",
       (r.submitted_at at time zone 'Asia/Kolkata')::date as "Request Raised",
       r.call_attended                                    as "Call Attended?",
       r.attended_date                                    as "Attended Date"
  from public.calls c
  join public.call_requests r on r.ucn = c.ucn
 where (select count(*) from public.call_requests r2 where r2.ucn = c.ucn) > 1
 order by c.ucn, r.submitted_at, r.id;
