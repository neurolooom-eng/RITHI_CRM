-- ===========================================================================
-- READ-ONLY. Imported stock lines that look loaded twice (D-178, 2026-10-14).
--
-- A file with no row numbers loaded twice before 0458 was numbered 1:A 2:B by
-- the first load and 3:A 4:B by the second (each new line takes the next
-- number), so the copies do NOT share a line number and
-- _stock_transfer_lines_repeated.sql cannot see them. This looks for what they
-- DO share: the same part and quantity under the same imported transfer (or the
-- same part and quantities under the same imported SI Number).
--
-- A pair here is a CANDIDATE, not a proof: one transfer may genuinely carry the
-- same part twice. What to do with them is the user's decision (D-178). The
-- simplest remedy once decided: re-load the transfer's (or SI Number's) file --
-- since 0465 a re-load REPLACES the whole group, so the copies go.
--
-- One result grid: rows 1-2 count the candidate groups, rows 101 onwards name
-- every line in them.
-- ===========================================================================
with stl as (
  select l.transfer_uid as grp, public.part_code(l.part) as code, l.qty, count(*) as copies
    from public.stock_transfer_lines l
    join public.stock_transfers t on t.uid = l.transfer_uid and coalesce(t.source, '') = 'import'
   group by 1, 2, 3 having count(*) > 1
), mrn as (
  select m.uid as grp, public.part_code(m.part) as code, m.good_qty, m.defective_qty, count(*) as copies
    from public.material_returns m
   where coalesce(m.source, '') = 'import'
   group by 1, 2, 3, 4 having count(*) > 1
)
select 1 as row, 'Transfer lines: same transfer, part and quantity more than once' as what,
       (select count(*) from stl)::text as value, '' as grp, '' as part, null::numeric as qty, null::bigint as line_id
union all
select 2, 'MRN lines: same SI Number, part and quantities more than once',
       (select count(*) from mrn)::text, '', '', null, null
union all
select 100 + row_number() over (order by l.transfer_uid, l.part, l.id)::int,
       'Transfer ' || l.transfer_uid || ' line ' || coalesce(l.row_no::text, '?') || ' (' || s.copies || ' alike)',
       '', l.transfer_uid, l.part, l.qty, l.id
  from public.stock_transfer_lines l
  join stl s on s.grp = l.transfer_uid and s.code = public.part_code(l.part) and s.qty = l.qty
union all
select 100000 + row_number() over (order by m.uid, m.part, m.id)::int,
       'SI ' || m.uid || ' line ' || coalesce(m.row_no::text, '?') || ' (' || s.copies || ' alike)',
       '', m.uid, m.part, coalesce(m.good_qty, 0) + coalesce(m.defective_qty, 0), m.id
  from public.material_returns m
  join mrn s on s.grp = m.uid and s.code = public.part_code(m.part)
            and s.good_qty is not distinct from m.good_qty and s.defective_qty is not distinct from m.defective_qty
 where coalesce(m.source, '') = 'import'
order by 1;
