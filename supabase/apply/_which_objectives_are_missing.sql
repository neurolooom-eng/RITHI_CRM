-- ===========================================================================
-- WHICH OF THE ORIGINAL OBJECTIVES ARE MISSING? (2026-10-06) -- READ-ONLY.
--
-- The user: "I deleted a Few Objectives, I want to Restore them". A delete on
-- quality_objectives removes the row outright and nothing keeps a copy, so the
-- only source to restore from is the list 0130 loaded (2026, twelve rows).
-- One grid: every one of those twelve with whether a row of that parameter
-- still exists for 2026 (matched the way the unique index matches:
-- lower(btrim(parameter))), then every 2026 objective that is NOT one of them.
-- ===========================================================================
with seed(sort_order, parameter) as (values
  (1, 'No.of Field failures registered in FFR'),
  (2, 'Recent Failure Rate of CPXcare'),
  (3, 'Recent Failure Rate of  Extend (Indian)'),
  (4, 'Recent Failure Rate of Orion-G'),
  (5, 'Recent Failure Rate of VEGA'),
  (6, 'Recent Failure Rate of MT75'),
  (7, 'Failure Rate of MT60'),
  (8, 'Breakdown Calls'),
  (9, 'Preventive Maintenance Calls'),
  (10, 'Installation call'),
  (11, 'Problem Call attending within 3 days'),
  (12, 'b.Customer feedback'))
select 'original' as kind, s.sort_order as n, s.parameter,
       case when q.id is null then 'MISSING' else 'present' end as state,
       q.id, q.source
  from seed s
  left join public.quality_objectives q
    on q.year = 2026 and lower(btrim(q.parameter)) = lower(btrim(s.parameter))
union all
select 'added since', q.sort_order, q.parameter, 'present', q.id, q.source
  from public.quality_objectives q
 where q.year = 2026
   and lower(btrim(q.parameter)) not in (select lower(btrim(parameter)) from seed)
order by 1 desc, 2;
