-- ===========================================================================
-- READ-ONLY PROBE (2026-10-12): the "Customer Feedback - 2025" workbook's
-- satisfaction %, worked out on RITHI's 2026 feedback. Per call: an
-- installation call's 5 installation questions / 20, any other call's 6
-- PM/FIELD questions / 24 (Excellent 4, Good 3, Average 2, Poor 1); a call
-- missing one of its questions is left out (the workbook's IFERROR -> "").
-- The period average, per quarter and month, by each candidate "Solved Date":
-- the feedback's own date (entry_at) and the visit date (visit_at).
-- ===========================================================================
with s as (
  select f.ucn, f.call_type, f.entry_at, f.visit_at,
         case when upper(btrim(coalesce(f.call_type, ''))) in ('INSTALLATION CALL', 'INSTALLATION') then 'inst' else 'pmf' end as kind,
         (select array_agg(case upper(btrim(f.answers ->> q)) when 'EXCELLENT' then 4 when 'GOOD' then 3 when 'AVERAGE' then 2 when 'POOR' then 1 end)
            from unnest(case when upper(btrim(coalesce(f.call_type, ''))) in ('INSTALLATION CALL', 'INSTALLATION')
                        then array['INSTALLATION-Startup, Training and Handing Over', 'INSTALLATION-Packing and Forwarding',
                                   'INSTALLATION-Delivery adherence schedule', 'INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment',
                                   'INSTALLATION/PM/FIELD-In general, support of our company for your requirements']
                        else array['INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment',
                                   'INSTALLATION/PM/FIELD-In general, support of our company for your requirements',
                                   'PM/FIELD-Ability of our Product to meet your requirement', 'PM/FIELD-Reliability of Product',
                                   'PM/FIELD-Reliability of Service', 'PM/FIELD-Promptness for Service Calls'] end) q) as sc
    from public.feedback f
),
p as (
  select s.*, (select sum(x) from unnest(sc) x)::numeric / (4 * cardinality(sc)) as pct,
         (select bool_and(x is not null) from unnest(sc) x) as complete
    from s
)
select n, item, value from (
  select 1 as n, 'feedback rows' as item, count(*)::text as value from p
  union all select 2, 'complete (every question of its kind answered)', count(*) filter (where complete)::text from p
  union all select 3, 'installation / other', count(*) filter (where kind = 'inst') || ' / ' || count(*) filter (where kind = 'pmf') from p
  union all
  select 10 + q, 'Q' || q || ' by entry_at', count(*) || ' calls, ' || round(avg(pct) * 100, 2) || '%'
    from (select extract(quarter from entry_at at time zone 'Asia/Kolkata')::int q, pct from p where complete and entry_at >= '2026-01-01' and entry_at < '2027-01-01') z group by q
  union all
  select 20 + q, 'Q' || q || ' by visit_at', count(*) || ' calls, ' || round(avg(pct) * 100, 2) || '%'
    from (select extract(quarter from visit_at at time zone 'Asia/Kolkata')::int q, pct from p where complete and visit_at >= '2026-01-01' and visit_at < '2027-01-01') z group by q
  union all
  select 30 + m, 'month ' || m || ' by entry_at / visit_at',
         coalesce(round(avg(pct) filter (where me = m) * 100, 2)::text, '-') || '% (' || count(*) filter (where me = m) || ') / '
         || coalesce(round(avg(pct) filter (where mv = m) * 100, 2)::text, '-') || '% (' || count(*) filter (where mv = m) || ')'
    from (select extract(month from entry_at at time zone 'Asia/Kolkata')::int me, extract(month from visit_at at time zone 'Asia/Kolkata')::int mv, pct
            from p where complete) z, generate_series(1, 12) m group by m
  union all
  select 50, 'entry_at and visit_at in different months', count(*) filter (where to_char(entry_at at time zone 'Asia/Kolkata', 'YYYY-MM') <> to_char(visit_at at time zone 'Asia/Kolkata', 'YYYY-MM'))::text from p
) x order by n;
