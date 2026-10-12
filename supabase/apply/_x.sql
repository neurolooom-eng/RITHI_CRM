-- READ-ONLY PROBE (2026-10-12): how many visits fall between midnight and
-- 05:30 in India -- the ones a UTC date put on the day before (D-168).
select count(*) as visits,
       count(*) filter (where (visit_at at time zone 'Asia/Kolkata')::time = '00:00') as at_ist_midnight,
       count(*) filter (where (visit_at at time zone 'Asia/Kolkata')::time > '00:00'
                          and (visit_at at time zone 'Asia/Kolkata')::time < '05:30') as midnight_to_0530,
       count(*) filter (where (visit_at at time zone 'Asia/Kolkata')::date <> visit_at::date) as day_differs_from_utc,
       count(*) filter (where visit_at >= '2025-01-01') as since_2025,
       count(*) filter (where visit_at >= '2025-01-01' and (visit_at at time zone 'Asia/Kolkata')::time = '00:00') as since_2025_at_midnight
  from public.reports;
