-- ===========================================================================
-- THE DCCR FAILURE RATE, SPLIT BY MONTH OF COMMISSIONING (2026-10-06) -- READ-ONLY.
--
-- What the Objective page's Failure Rate (DCCR) tab shows, for one product,
-- as at today: Parc and the failures / rates before 3, 6 and 12 months, for
-- the last 24 commissioning months; row 0 says how many Field calls of each
-- year the register holds (the historical DCCR load), and row 999 the 12-month
-- rolling average of the 3-month rate the Objective takes.
-- CHANGE THE PRODUCT on the first line (a pattern, as on the objective).
-- ===========================================================================
with prm as (select '%T75%'::text as prod),
c3  as (select * from public._dccr_failure_cohort_rows((select prod from prm), '%', current_date, 3)),
c6  as (select * from public._dccr_failure_cohort_rows((select prod from prm), '%', current_date, 6)),
c12 as (select * from public._dccr_failure_cohort_rows((select prod from prm), '%', current_date, 12))
select 0 as n, 'Field calls by year: ' || (select string_agg(y || '=' || c, ', ' order by y) from
         (select lpad((extract(year from reg_date)::int % 100)::text, 2, '0') as y, count(*) as c
            from public.field_calls group by 1) z) as month,
       null::int as parc, null::int as f3, null::text as r3, null::int as f6, null::text as r6, null::int as f12, null::text as r12
union all
select row_number() over (order by c3.month)::int, to_char(c3.month, 'MM-YY'), c3.parc,
       c3.failures, to_char(c3.rate * 100, 'FM990') || '%', c6.failures, to_char(c6.rate * 100, 'FM990') || '%',
       c12.failures, to_char(c12.rate * 100, 'FM990') || '%'
  from c3 join c6 using (month) join c12 using (month)
 where c3.month >= (date_trunc('month', current_date) - interval '23 months')::date
union all
select 999, 'rolling 12 (3-month rate, avg)', null, null,
       to_char(avg(rate) * 100, 'FM990.00') || '%', null, null, null, null
  from c3 where month >= (date_trunc('month', current_date) - interval '11 months')::date and rate is not null
order by 1;
