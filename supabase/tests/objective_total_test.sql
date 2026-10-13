-- ===========================================================================
-- THE TOTAL COLUMN IS CALCULATED, THE SHEET'S WAY (0428).
--
--   The FFR count sums its months (the sheet: 34). A percentage averages the
--   months that carry a figure (the sheet: CPXcare 0.2857%, attended 94.29%,
--   PM 10% from two quarters). A typed objective keeps its typed Total; a
--   month typed over by hand moves the Total with it.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.quality_objectives (year, sort_order, process, parameter, yearly_target, frequency, calc_key,
                                       m01, m02, m03, m04, m05, m06, m07, total) values
 (2091, 1, 'T', 'TOT ffr',      'To Monitor', 'Monthly',  'ffr_count_monthly',    0, 9, 7, 6, 2, 4, 6, 999),
 (2091, 2, 'T', 'TOT cpx',      '<5%',        'Monthly',  'dccr_failure_cohort',  0.01, 0.01, 0, 0, 0, 0, 0, null),
 (2091, 3, 'T', 'TOT attended', '>75%',       'Monthly',  'attended_within_days', 0.92, 0.93, 0.94, 0.95, 0.96, 0.94, 0.96, null),
 (2091, 4, 'T', 'TOT pm',       '<12%',       '3 Months', 'open_rate_monthly',    null, null, 0.1, null, null, 0.1, null, null),
 (2091, 5, 'T', 'TOT typed',    '<10%',       'Monthly',  '',                     0.1, 0.2, null, null, null, null, null, 0.42);

\echo '--- 1. the sheet''s own Totals ---'
select 'FFR count: the sum, 34 (a sent 999 replaced)' as t, total = 34 as ok from public.quality_objectives where parameter = 'TOT ffr';
select 'CPXcare: the average of the 7 months, 0.2857%' as t, round(total, 6) = 0.002857 as ok from public.quality_objectives where parameter = 'TOT cpx';
select 'attended within 3 days: 94.29%' as t, round(total, 6) = 0.942857 as ok from public.quality_objectives where parameter = 'TOT attended';
select 'PM: two quarters at 10% average 10%; the NA months are not zeros' as t, total = 0.1 as ok from public.quality_objectives where parameter = 'TOT pm';
select 'a typed objective keeps its typed Total' as t, total = 0.42 as ok from public.quality_objectives where parameter = 'TOT typed';

\echo '--- 2. a month changed moves the Total ---'
update public.quality_objectives set m08 = 13 where parameter = 'TOT ffr';
select 'FFR count after August 13: 47' as t, total = 47 as ok from public.quality_objectives where parameter = 'TOT ffr';
update public.quality_objectives set m02 = null where parameter = 'TOT cpx';
select 'CPXcare with February emptied: 0.01 over 6 months' as t, round(total, 6) = round(0.01 / 6, 6) as ok from public.quality_objectives where parameter = 'TOT cpx';
update public.quality_objectives set m03 = 0.5 where parameter = 'TOT typed';
select 'the typed objective''s Total is still what was typed' as t, total = 0.42 as ok from public.quality_objectives where parameter = 'TOT typed';

delete from public.quality_objectives where year = 2091;
