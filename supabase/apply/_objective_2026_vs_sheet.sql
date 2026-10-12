-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12): every 2026 objective -- stored figures and a
-- fresh calculation per month -- to compare with the shared sheet
-- "Service Quality Objective -2026.xlsx". One grid, one row per objective.
-- ===========================================================================
select o.sort_order as n,
       o.id || ' · ' || coalesce(o.parameter, '') as item,
       'key=' || coalesce(nullif(o.calc_key, ''), '(typed)') || ' status=' || coalesce(o.status, '')
       || ' | stored ' || concat_ws(' ', coalesce(o.m01::text, '-'), coalesce(o.m02::text, '-'), coalesce(o.m03::text, '-'),
                                  coalesce(o.m04::text, '-'), coalesce(o.m05::text, '-'), coalesce(o.m06::text, '-'),
                                  coalesce(o.m07::text, '-'), coalesce(o.m08::text, '-'), coalesce(o.m09::text, '-'))
       || ' total=' || coalesce(o.total::text, '-')
       || case when o.calc_key <> '' then ' | fresh ' || concat_ws(' ',
            coalesce(public.objective_value(o.id, 1)::text, '-'), coalesce(public.objective_value(o.id, 2)::text, '-'),
            coalesce(public.objective_value(o.id, 3)::text, '-'), coalesce(public.objective_value(o.id, 4)::text, '-'),
            coalesce(public.objective_value(o.id, 5)::text, '-'), coalesce(public.objective_value(o.id, 6)::text, '-'),
            coalesce(public.objective_value(o.id, 7)::text, '-'), coalesce(public.objective_value(o.id, 8)::text, '-'),
            coalesce(public.objective_value(o.id, 9)::text, '-')) else '' end
       || ' overrides=' || coalesce(o.overrides::text, '{}') as value
  from public.quality_objectives o
 where o.year = 2026
 order by o.sort_order, o.id;
