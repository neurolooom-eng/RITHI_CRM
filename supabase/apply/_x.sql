-- READ-ONLY PROBE (2026-10-13): the visits already on the live project whose
-- UC Number is of the 2018-2022 shape and that belong to no call. One grid.
select r.ucn, count(*) as visits,
       min(r.visit_at)::date::text as first_visit, max(r.visit_at)::date::text as last_visit,
       (array_agg(r.call_status order by r.updated_at desc nulls last, r.id desc))[1] as latest_status,
       string_agg(distinct coalesce(r.data->>'imported_from', r.data->>'source', ''), ',') as source
  from public.reports r
 where r.ucn ~ '^(18|19|20|21|22)[A-L][0-9]{5}$'
 group by r.ucn
 order by r.ucn;
