-- ===========================================================================
-- WHICH CONSUMPTION ROWS HAVE NO VISIT BEHIND THEM?
--
-- READ-ONLY, no editing. Paste and run.
--
-- These are the rows whose "Visit Entry Date" and "Visit Date & Time" come out
-- blank on the Consumption Report, and the reason is the same for every one of
-- them: the call has no row in `reports` — the visit was never filed. Neither
-- column lives on the consumption row, so neither can be filled in there.
--
-- 0214 stops NEW ones being booked. It deliberately does NOT rewrite these:
-- an insert-time rule applied backwards to a quality record would be inventing
-- a visit that did not happen, which is worse than a blank that is true.
--
-- WHAT TO DO WITH THE LIST: file the missing visit report against the UCN and
-- the columns fill themselves, because the report reads them through a join —
-- nothing needs re-entering on the consumption side.
-- ===========================================================================
select
  sc.ucn,
  coalesce(nullif(btrim(sc.call_number), ''), '(none)')            as call_number,
  count(*)                                                         as spare_lines,
  sum(coalesce(sc.qty, 0))                                         as total_qty,
  coalesce(nullif(btrim(max(sc.engineer)), ''), '(not recorded)')  as engineer,
  max(sc.source)                                                   as booked_as,
  min(sc.created_at)                                               as first_booked,
  max(sc.created_at)                                               as last_booked,
  case when c.ucn is null then '*** and no CALL either — check the UCN ***'
       else 'call exists; the visit report was never filed' end     as diagnosis
  from public.spare_consumption sc
  left join public.calls c on c.ucn = sc.ucn
 where not exists (select 1 from public.reports r where r.ucn = sc.ucn)
 group by sc.ucn, sc.call_number, c.ucn
 order by count(*) desc, sc.ucn;
