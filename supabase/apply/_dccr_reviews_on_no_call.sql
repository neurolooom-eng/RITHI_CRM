-- ===========================================================================
-- DCCR REVIEWS WHOSE UC NUMBER IS ON NO CALL (2026-10-06) -- READ-ONLY.
--
-- The user, shown ~10,000 DCCR rows with UC Numbers beginning 41-53 that match
-- no call: "Show me first". One grid: row 0 counts them by the first two
-- characters of the UC Number; rows 1-200 are the first 200 of the odd ones
-- (UC Numbers that do not look like a call's -- two digits then a letter),
-- with what each carries, so you can see what they are before anything is
-- done. Nothing is changed.
-- ===========================================================================
with orphan as (
  select r.*
    from public.call_reviews r
   where not exists (select 1 from public.field_calls f where f.ucn = r.ucn)
     and not exists (select 1 from public.installation_calls i where i.ucn = r.ucn)
     and not exists (select 1 from public.pm_calls m where m.ucn = r.ucn)
), odd as (
  select o.*, row_number() over (order by o.ucn) as n
    from orphan o
   where btrim(o.ucn) !~ '^[0-9]{2}[A-Za-z]'
)
select 0 as n, 'COUNT by first two characters' as ucn, string_agg(k || ': ' || c, ', ' order by k) as call_number,
       '' as complaint_grouping, '' as root_cause_keyword, '' as spare_category, null::date as review2_at,
       null::timestamptz as created_at, null::boolean as imported
  from (select left(btrim(ucn), 2) as k, count(*)::text as c from orphan group by 1) g
union all
select n, ucn, call_number, complaint_grouping, root_cause_keyword, spare_category, review2_at, created_at, imported
  from odd where n <= 200
order by 1;
