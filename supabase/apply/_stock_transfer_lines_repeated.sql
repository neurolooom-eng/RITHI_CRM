-- ===========================================================================
-- READ-ONLY. Transfer lines that share a transfer and a line number (D-071, 0438).
--
-- 0438 keys the Stock Transfer Lines upload on transfer + line number, so a
-- re-loaded line takes the file's values instead of moving the stock again. A
-- unique key cannot be built while two lines already share one -- which is what
-- a file loaded twice before 0438 leaves -- and 0438 then says so and leaves the
-- key off. This lists those lines, one result grid: row 1 says how many pairs
-- there are, rows 101 onwards name each line.
--
-- What to do with them is a decision about stock, not something this file does:
-- a repeated line is usually the same movement loaded twice, and each copy counts
-- in the engineers' hand stock. Once none is left, re-run 0438
-- (supabase/migrations/0438_stock_loads_overwrite_on_reload.sql), or the
-- handstock bundle, and _status.sql row 366 reads YES.
-- ===========================================================================
with rep as (
  select transfer_uid, row_no, count(*) as copies
    from public.stock_transfer_lines
   where row_no is not null
   group by transfer_uid, row_no
  having count(*) > 1
)
select 1 as row, 'Transfer line numbers held by more than one line' as what,
       (select count(*) from rep)::text as value, '' as transfer_uid, null::int as row_no,
       '' as part, null::numeric as qty, null::bigint as line_id
union all
select 100 + row_number() over (order by l.transfer_uid, l.row_no, l.id)::int,
       'Line ' || l.row_no || ' of ' || l.transfer_uid
         || ' (' || r.copies || ' copies; transfer ' || coalesce(t.source, '') || ', dated '
         || coalesce(to_char(t.transfer_date, 'DD-Mon-YYYY'), '?') || ')',
       '', l.transfer_uid, l.row_no, l.part, l.qty, l.id
  from public.stock_transfer_lines l
  join rep r on r.transfer_uid = l.transfer_uid and r.row_no = l.row_no
  left join public.stock_transfers t on t.uid = l.transfer_uid
order by 1;
