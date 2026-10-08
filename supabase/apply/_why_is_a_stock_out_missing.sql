-- ===========================================================================
-- WHY IS A HISTORICAL STOCK OUT MISSING FROM AN ENGINEER'S HAND STOCK?
-- (2026-10-08). READ-ONLY. One grid.
--
-- The user, on ABHISHEK BISWAS / ESA-009: "Stock out should be 6 from history,
-- but its showing 5. I need to investigate."
--
-- handstock_movements (the trail on the Hand Stock drawer) reads a historical
-- stock out from spare_issue_history ONLY when all of these hold:
--   * it is dated on or after the hand stock cut-off (handstock_cutoff());
--   * its line_uid is NOT a live request line Stores has already dispatched --
--     that one is counted from the live dispatch instead, so it is not counted
--     twice;
-- and the drawer shows the rows whose engineer_key and part_code are the
-- line's own. This lists EVERY history row whose engineer NAME or part CODE
-- looks like the ones asked about, with each test answered, so a row the
-- drawer leaves out says why. Change the two values on the `ask` line.
-- ===========================================================================
with ask as (select 'ABHISHEK BISWAS'::text as engineer, 'ESA-009'::text as part_code),
drawer as (
  -- the keys the drawer itself uses: the movement view's own, for this pair
  select distinct m.engineer_key, m.part_code
    from public.handstock_movements m, ask
   where upper(btrim(m.engineer)) = upper(btrim(ask.engineer))
     and upper(btrim(m.part_code)) = upper(btrim(ask.part_code))
)
select h.id,
       h.engineer, h.engineer_key, h.part_code, h.part, h.qty,
       to_char(coalesce(h.issued_at, h.created_at) at time zone 'Asia/Kolkata', 'DD-Mon-YY HH24:MI') as dated,
       h.so_no, h.line_uid, h.source,
       coalesce(h.issued_at, h.created_at) >= (select public.handstock_cutoff()) as after_cutoff,
       (select string_agg(l.line_uid || ' (' || coalesce(l.stores_status, '') || ', dispatched ' || coalesce(l.dispatched_qty, 0)::text || ')', '; ')
          from public.spare_request_lines l
         where h.line_uid <> '' and lower(btrim(l.line_uid)) = lower(btrim(h.line_uid))
           and (coalesce(l.dispatched_qty, 0) > 0 or coalesce(l.stores_status, '') ~* 'dispatch')) as counted_as_live_line,
       exists (select 1 from drawer d where d.engineer_key = h.engineer_key) as same_engineer_key,
       exists (select 1 from drawer d where d.part_code = h.part_code) as same_part_code,
       coalesce(h.qty, 0) > 0 as has_qty,
       (select string_agg(distinct d.engineer_key || ' / ' || d.part_code, '; ') from drawer d) as drawer_keys
  from public.spare_issue_history h, ask
 where (upper(h.engineer) like '%' || upper(btrim(ask.engineer)) || '%'
        or upper(h.engineer_key) like '%' || upper(replace(btrim(ask.engineer), ' ', '%')) || '%')
   and (upper(btrim(h.part_code)) = upper(btrim(ask.part_code))
        or upper(h.part) like '%' || upper(btrim(ask.part_code)) || '%')
 order by coalesce(h.issued_at, h.created_at), h.id;
