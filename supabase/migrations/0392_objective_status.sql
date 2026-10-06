-- ===========================================================================
-- 0392  AN OBJECTIVE HAS A STATUS, AND THE FIVE DELETED ONES COME BACK
--       (2026-10-06).
--
-- The user: "I want to finish the Objective Data. I deleted a Few Objectives,
-- I want to Restore them, But Hide Them or add a Field -- 'Not Working', 'Do
-- Not Use'". Their answers: a Status field AND hiding (Active / Not Working /
-- Do Not Use; the last two hidden by default, a Show hidden switch reveals
-- them); the five restored as Not Working; with their original figures; and
-- the status HIDES ONLY -- the objective can still be edited and re-calculated.
--
-- WHICH FIVE, measured on the live project (_which_objectives_are_missing.sql,
-- 2026-10-06): of the twelve 2026 objectives 0130 loaded, CPXcare, Extend
-- (Indian), Orion-G, VEGA and MT60 had no row. A delete removes the row
-- outright and nothing kept a copy, so they are restored FROM 0130's own list
-- -- the parameter, targets, frequency, responsible and the January-July
-- figures it was loaded with -- and given back what 0132/0133 pointed them at
-- (failure_rate_12m on the product, the Indian Extend on serial INXT%), so
-- Re-calculate treats them as it treats their sibling MT75. Any figure added
-- after 0130 and before the delete is not recoverable; Re-calculate rebuilds
-- the computed months.
--
-- ON CONFLICT DO NOTHING: a row that exists is never touched, so a re-run, or
-- an objective of the same name somebody has since added, is left as it is.
-- ===========================================================================

alter table public.quality_objectives
  add column if not exists status text not null default 'Active';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.quality_objectives'::regclass
                    and conname = 'quality_objectives_status_check') then
    alter table public.quality_objectives
      add constraint quality_objectives_status_check
      check (status in ('Active', 'Not Working', 'Do Not Use'));
  end if;
end $$;

comment on column public.quality_objectives.status is
  'Active / Not Working / Do Not Use (0392). The last two are hidden on the Objective page unless Show hidden is on; nothing else changes -- the objective is still edited and re-calculated as before.';

insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, current_target, frequency, responsible,
   m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, total, calc_key, calc_params, status)
values
  (2026, 2, 'SERVICE', 'Recent Failure Rate of CPXcare', '<5%', '-', 'Monthly', 'National Service Manager', 0.01, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, null, null, null, null, null, 0.002857,
   'failure_rate_12m', jsonb_build_object('product', '%CPX%'), 'Not Working'),
  (2026, 3, 'SERVICE', 'Recent Failure Rate of  Extend (Indian)', '<8%', '-', 'Monthly', 'National Service Manager', 0.18, 0.06, 0.03, 0.02, 0.02, 0.02, 0.02, null, null, null, null, null, 0.05,
   'failure_rate_12m', jsonb_build_object('product', '%EXTEND%', 'serial', 'INXT%'), 'Not Working'),
  (2026, 4, 'SERVICE', 'Recent Failure Rate of Orion-G', '<5%', '-', 'Monthly', 'National Service Manager', 0.01, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, null, null, null, null, null, 0.002857,
   'failure_rate_12m', jsonb_build_object('product', '%ORION%'), 'Not Working'),
  (2026, 5, 'SERVICE', 'Recent Failure Rate of VEGA', '<6%', '-', 'Monthly', 'National Service Manager', 0.1, 0.11, 0.11, 0.05, 0.05, 0.01, 0.01, null, null, null, null, null, 0.062857,
   'failure_rate_12m', jsonb_build_object('product', '%VEGA%'), 'Not Working'),
  (2026, 7, 'SERVICE', 'Failure Rate of MT60', '<6%', '-', 'Monthly', 'National Service Manager', 0.08, 0.08, 0.03, 0.01, 0.01, 0.01, 0.01, null, null, null, null, null, 0.032857,
   'failure_rate_12m', jsonb_build_object('product', '%T60%'), 'Not Working')
on conflict (year, lower(btrim(parameter))) do nothing;
