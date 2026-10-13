-- READ-ONLY PROBE (2026-10-13): the six Recent Failure Rates, fresh, months
-- 1-9 of 2026, and how many DCCR-history calls sit in the live tables -- run
-- before and after 0430/0431 to show no figure moves. One grid.
select o.parameter as item,
       concat_ws(' ', coalesce(public.objective_value(o.id, 1)::text, '-'), coalesce(public.objective_value(o.id, 2)::text, '-'),
                 coalesce(public.objective_value(o.id, 3)::text, '-'), coalesce(public.objective_value(o.id, 4)::text, '-'),
                 coalesce(public.objective_value(o.id, 5)::text, '-'), coalesce(public.objective_value(o.id, 6)::text, '-'),
                 coalesce(public.objective_value(o.id, 7)::text, '-'), coalesce(public.objective_value(o.id, 8)::text, '-'),
                 coalesce(public.objective_value(o.id, 9)::text, '-')) as value
  from public.quality_objectives o
 where o.year = 2026 and o.calc_key = 'dccr_failure_cohort'
union all
select 'live DCCR-history calls (field / pm)',
       (select count(*) from public.field_calls where extra->>'imported_from' = 'DCCR register (historical)')::text || ' / ' ||
       (select count(*) from public.pm_calls where extra->>'imported_from' = 'DCCR register (historical)')::text
union all
select 'call_history rows', (select count(*) from public.call_history)::text;
