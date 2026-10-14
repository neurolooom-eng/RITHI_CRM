-- Read-only probe: what restating Complaint Date (request date) and Breakdown
-- Date (request's Attended Date) would change on calls registered from a request.
with links as (
  select c.ucn, c.call_type, c.complaint_date, c.breakdown_date,
         count(*) over (partition by c.ucn) as reqs,
         (r.submitted_at at time zone 'Asia/Kolkata')::date as req_day,
         r.attended_date
    from public.calls c join public.call_requests r on r.ucn = c.ucn
), one as (select * from links where reqs = 1)
select 1 as n, 'calls linked to a request' as k, count(distinct ucn)::text as v from links
union all select 2, 'calls linked to MORE THAN ONE request', count(distinct ucn)::text from links where reqs > 1
union all select 3, 'request with no submitted date', count(*)::text from one where req_day is null
union all select 4, 'request with no Attended Date', count(*)::text from one where attended_date is null
union all select 5, 'complaint date would change', count(*)::text from one where req_day is not null and complaint_date is distinct from req_day
union all select 6, 'breakdown date would change', count(*)::text from one where breakdown_date is distinct from coalesce(attended_date, req_day)
union all select 7, 'attended AFTER request date', count(*)::text from one where attended_date > req_day
union all select 8, 'attended more than 30 days BEFORE request', count(*)::text from one where attended_date < req_day - 30
union all select 9, 'by type: ' || call_type, count(*)::text from one group by call_type
union all select 10, 'reg year of linked calls: ' || min(extract(year from req_day))::text || '-' || max(extract(year from req_day))::text, count(*)::text from one
union all select 11, 'calls with breakdown after complaint (all)', count(*)::text from public.calls where breakdown_date > complaint_date
union all select 12, 'calls with complaint after registration day (all)', count(*)::text from public.calls where complaint_date > coalesce((reg_at at time zone 'Asia/Kolkata')::date, reg_date)
order by 1, 2;
