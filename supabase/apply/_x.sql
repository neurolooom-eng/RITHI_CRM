-- Read-only probe: where do Complaint Date and Breakdown Date come from, and
-- why is Breakdown Date blank on 26H07F0011? One grid: rows 1-3 the three
-- calls with their requests; rows 10+ the register-wide counts.
with three as (
  select 1 as n, c.ucn, c.call_number, c.reg_at::text as reg_at, c.complaint_date::text as complaint, c.breakdown_date::text as breakdown,
         r.submitted_at::text as req_submitted, r.call_attended, r.attended_date::text as req_attended, r.plan_date::text as req_plan,
         r.status as req_status, c.sys_created_on::text as row_created
    from public.calls c
    left join public.call_requests r on r.ucn = c.ucn
   where c.ucn in ('26H07F0011', '26H07F0010', '26H31F0009')
), counts as (
  select 10 + row_number() over (order by k) as n, k as ucn, null::text as call_number, null::text as reg_at,
         null::text as complaint, null::text as breakdown, v::text as req_submitted, null::text, null::text, null::text, null::text, null::text
    from (
      select 'calls total' k, count(*) v from public.calls
      union all select 'breakdown_date blank', count(*) from public.calls where breakdown_date is null
      union all select 'breakdown blank, reg 2026', count(*) from public.calls where breakdown_date is null and reg_date >= date '2026-01-01'
      union all select 'breakdown blank, from a request', count(*) from public.calls c where breakdown_date is null and exists (select 1 from public.call_requests r where r.ucn = c.ucn)
      union all select 'complaint_date blank', count(*) from public.calls where complaint_date is null
      union all select 'from a request (any)', count(*) from public.calls c where exists (select 1 from public.call_requests r where r.ucn = c.ucn)
      union all select 'request: attended_date set', count(*) from public.call_requests where attended_date is not null and ucn is not null
      union all select 'request: complaint = submitted day', count(*) from public.calls c join public.call_requests r on r.ucn = c.ucn where c.complaint_date = (r.submitted_at at time zone 'Asia/Kolkata')::date
      union all select 'request: complaint = attended day', count(*) from public.calls c join public.call_requests r on r.ucn = c.ucn where c.complaint_date = r.attended_date
      union all select 'request: breakdown = attended day', count(*) from public.calls c join public.call_requests r on r.ucn = c.ucn where c.breakdown_date = r.attended_date
      union all select 'breakdown blank by type: ' || call_type, count(*) from public.calls where breakdown_date is null group by call_type
    ) x
)
select * from three union all select * from counts order by 1, 2;
