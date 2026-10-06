-- ===========================================================================
-- 0399  PM CALLS WITH A SPARE: THE 2026 CATCH-UP, RE-RUN (2026-10-06).
--
-- The user: "re-run the PM consumption". 0397's backfill found no PM call
-- because the Part Master then had 31 parts categorised Spare and none was on
-- a 2026 PM call; the mapping has since grown (280 Spare, measured on the live
-- project by _pm_spares_for_dccr.sql), and 28 PM calls of 2026 now carry one.
-- The same statement as 0397's, for the same year: a PM call with a Spare
-- consumed (quantity above 0) gets its DCCR review, SPARE pre-set; a review
-- already there is left alone. Older years are not added -- the user's answer
-- was "New + this year so far", older calls once the mapping is complete.
-- ===========================================================================
do $$
declare n integer;
begin
  if to_regprocedure('public.part_is_spare(text)') is null then return; end if;
  insert into public.call_reviews (ucn, call_number, spare_category)
  select distinct p.ucn, coalesce(p.call_number, ''), 'SPARE'
    from public.pm_calls p
    join public.spare_consumption s on s.ucn = p.ucn
   where p.reg_date >= date '2026-01-01'
     and coalesce(s.qty, 0) > 0
     and public.part_is_spare(s.part)
  on conflict (ucn) do nothing;
  get diagnostics n = row_count;
  raise notice '0399: % PM call(s) of 2026 with a Spare consumed added to the DCCR review', n;
end $$;
