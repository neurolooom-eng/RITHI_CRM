-- Read-only: how 2026's PM call numbers are formed, month by month.
with m as (
  select date_trunc('month', reg_date)::date as mon, call_number, product_name, serial, reg_at, cancelled_at
    from public.pm_calls where reg_date >= date '2025-10-01'
), p as (
  select mon, call_number, product_name, serial, reg_at, cancelled_at,
         substring(call_number from '^\d{2}PM[A-Z]{3}(\d+)-')::int as seq,
         call_number ~ '^\d{2}PM[A-Z]{3}\d+-[A-L]-' as shaped,
         call_number = to_char(mon, 'YY') || 'PM' || upper(to_char(mon, 'MON'))
                       || substring(call_number from '^\d{2}PM[A-Z]{3}(\d+)-') || '-'
                       || chr(64 + extract(month from mon)::int) || '-' || product_name || '-' || serial as exact
    from m
)
select to_char(mon, 'YYYY-MM') as month, count(*) as calls, count(*) filter (where cancelled_at is not null) as cancelled,
       count(*) filter (where shaped) as shaped, count(*) filter (where exact) as exact_rebuild,
       max(seq) as max_seq, count(distinct seq) as distinct_seq,
       (select string_agg(x.call_number, ' || ' order by x.reg_at desc) from (select call_number, reg_at from p p2 where p2.mon = p.mon order by reg_at desc nulls last limit 2) x) as latest_two,
       (select string_agg(y.call_number, ' || ') from (select call_number from p p3 where p3.mon = p.mon and not p3.exact limit 3) y) as not_exact_samples
  from p group by mon order by mon;
