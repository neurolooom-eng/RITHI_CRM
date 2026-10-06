-- ===========================================================================
-- WHY DID NO PM CALL JOIN THE DCCR? (2026-10-06) -- READ-ONLY.
--
-- 0397 adds a PM call to the DCCR review when a part consumed on it is
-- categorised Spare in the Part Master. Its 2026 backfill added none. One grid:
-- the Part Master's categories with how many parts each; then the consumption
-- lines booked on PM calls (by year) split by the category of their part,
-- including parts the Part Master does not know at all.
-- ===========================================================================
select 'part master' as what, coalesce(nullif(btrim(category), ''), '(blank)') as category,
       count(*) as n, null::bigint as pm_calls
  from public.parts group by 2
union all
select 'PM consumption yr ' || lpad((extract(year from p.reg_date)::int % 100)::text, 2, '0'),
       coalesce(nullif(btrim(pa.category), ''), case when pa.code is null then '(part not in Part Master)' else '(blank)' end),
       count(*), count(distinct p.ucn)
  from public.spare_consumption s
  join public.pm_calls p on p.ucn = s.ucn
  left join lateral (select x.code, x.category from public.parts x
                      where lower(btrim(x.code)) = lower(btrim(split_part(coalesce(s.part, ''), '|', 1))) limit 1) pa on true
 where coalesce(s.qty, 0) > 0
 group by 1, 2
order by 1, 3 desc;
