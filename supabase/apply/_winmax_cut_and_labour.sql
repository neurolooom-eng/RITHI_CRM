-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12) -- two questions, one grid.
--
--  A. "Skip all consumption & Stockout before 10June2022 -- 10June2022 -
--     Winmax Opening Resets all old transactions." What sits before the line,
--     what falls on 09-Jun-2022 (the day the WinMax pool is dated), and what
--     the cut does to the balances.
--     C1 = the cut-off close_through 08-Jun-2022 would give (WinMax pool kept).
--     C2 = the cut-off close_through 09-Jun-2022 would give.
--  B. SC001 / TC001 / INS-001 -- labour charges. Where they appear today.
-- ===========================================================================
with c as (
  select ('2022-06-08'::date + 1)::timestamptz as c1, ('2022-06-09'::date + 1)::timestamptz as c2
),
m as (select * from public.handstock_movements),
now_ as (
  select engineer_key, part_code, sum(case when direction = 'IN' then qty else -qty end) as q
    from m group by 1, 2
),
after_ as (
  select engineer_key, part_code, sum(case when direction = 'IN' then qty else -qty end) as q
    from m, c where m.moved_at >= c.c1 group by 1, 2
),
j as (
  select n.engineer_key, n.part_code, n.q as q_now, coalesce(a.q, 0) as q_after
    from now_ n left join after_ a using (engineer_key, part_code)
),
lab as (select unnest(array['SC001','TC001','INS-001']) as code)
select n, item, value from (
  select 1 as n, 'closed_through (current)' as item, coalesce((select closed_through::text from public.handstock_period limit 1), '(none)') as value
  union all select 2, 'handstock_cutoff() now', public.handstock_cutoff()::text
  union all select 3, 'session TimeZone', current_setting('TimeZone')
  union all select 4, 'C1 / C2', (select c1::text || '  /  ' || c2::text from c)
  -- opening pools
  union all
  select 10 + row_number() over (order by source_key, as_of)::int, 'opening pool ' || source_key || ' as_of ' || as_of,
         count(*) || ' rows, ' || sum(qty) || ' units'
    from public.handstock_opening group by source_key, as_of
  -- before C1, by kind
  union all
  select 30 + row_number() over (order by movement, ref_type)::int, 'BEFORE C1: ' || movement || ' / ' || ref_type,
         count(*) || ' rows, ' || sum(qty) || ' units, ' || min(moved_at)::date || ' .. ' || max(moved_at)::date
    from m, c where m.moved_at < c.c1 group by movement, ref_type
  -- between C1 and C2 (the one day in question)
  union all
  select 50 + row_number() over (order by movement, ref_type)::int, 'C1..C2 (09-Jun-2022): ' || movement || ' / ' || ref_type,
         count(*) || ' rows, ' || sum(qty) || ' units'
    from m, c where m.moved_at >= c.c1 and m.moved_at < c.c2 group by movement, ref_type
  union all
  select 60 + row_number() over (order by movement, ref_type)::int, '09-Jun-2022 00:00..05:30 IST (UTC cut would drop): ' || movement || ' / ' || ref_type,
         count(*) || ' rows, ' || sum(qty) || ' units'
    from m where m.moved_at >= timestamptz '2022-06-09 00:00+05:30' and m.moved_at < timestamptz '2022-06-09 00:00+00' group by movement, ref_type
  union all select 70, 'lines (engineer+part) now', count(*)::text from j
  union all select 71, 'lines whose balance changes at C1', count(*) filter (where q_now <> q_after)::text from j
  union all select 72, 'lines negative now', count(*) filter (where q_now < 0) || ' (' || coalesce(sum(q_now) filter (where q_now < 0), 0) || ')' from j
  union all select 73, 'lines negative after C1', count(*) filter (where q_after < 0) || ' (' || coalesce(sum(q_after) filter (where q_after < 0), 0) || ')' from j
  union all select 74, 'negative now -> not negative after', count(*) filter (where q_now < 0 and q_after >= 0)::text from j
  union all select 75, 'not negative now -> negative after', count(*) filter (where q_now >= 0 and q_after < 0)::text from j
  union all select 76, 'total units now / after', sum(q_now) || ' / ' || sum(q_after) from j
  union all
  select 77, 'MP-010 SUNIL now / after', string_agg(q_now || ' / ' || q_after, '; ')
    from j where part_code = 'MP-010' and engineer_key like '%sunil%'
  -- B. labour codes
  union all
  select 100 + row_number() over (order by lab.code)::int, 'Part Master ' || lab.code,
         coalesce((select string_agg(p.code || ' | ' || coalesce(p.description, '') || ' | active=' || p.active || ' | category=' || coalesce(p.category, ''), '; ')
                     from public.parts p where upper(btrim(p.code)) = lab.code), '(not in Part Master)')
    from lab
  union all
  select 110 + row_number() over (order by lab.code)::int, 'spare_consumption ' || lab.code,
         count(c2.*) || ' rows; qty=1: ' || count(*) filter (where c2.qty = 1) || '; qty>1: ' || count(*) filter (where c2.qty > 1)
         || '; qty=0 (voided): ' || count(*) filter (where c2.qty = 0) || '; max ' || coalesce(max(c2.qty)::text, '-')
         || '; sources: ' || coalesce(string_agg(distinct coalesce(c2.source, '(blank)'), ', '), '-')
    from lab left join public.spare_consumption c2 on upper(public.part_code(c2.part)) = lab.code group by lab.code
  union all
  select 120 + row_number() over (order by lab.code)::int, 'spare_consumption_history ' || lab.code,
         count(h.*) || ' rows; qty>1: ' || count(*) filter (where h.qty > 1) || '; max ' || coalesce(max(h.qty)::text, '-')
    from lab left join public.spare_consumption_history h on upper(h.part_code) = lab.code group by lab.code
  union all
  select 130 + row_number() over (order by lab.code)::int, 'spare_request_lines ' || lab.code,
         count(l.*) || ' lines; dispatched: ' || count(*) filter (where coalesce(l.dispatched_qty, 0) > 0)
    from lab left join public.spare_request_lines l on upper(public.part_code(l.part)) = lab.code group by lab.code
  union all
  select 140 + row_number() over (order by lab.code)::int, 'spare_issue_history / opening ' || lab.code,
         (select count(*) from public.spare_issue_history i where upper(i.part_code) = lab.code) || ' issued rows; '
         || (select count(*) from public.handstock_opening o where upper(o.part_code) = lab.code) || ' opening rows'
    from lab
  union all
  select 150 + row_number() over (order by lab.code)::int, 'hand stock lines ' || lab.code,
         count(j.*) || ' engineer lines; negative: ' || count(*) filter (where j.q_now < 0) || ' (' || coalesce(sum(j.q_now), 0) || ' units)'
    from lab left join j on upper(j.part_code) = lab.code group by lab.code
) x
order by n;
