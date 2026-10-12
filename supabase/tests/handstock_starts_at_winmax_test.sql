-- ===========================================================================
-- HAND STOCK STARTS AT THE WINMAX OPENING, 09-JUN-2022 (0412, D-162).
--
--   1. the line is closed through 08-Jun-2022 and falls at 09-Jun-2022 00:00
--      in India (18:30 UTC the day before), not at 05:30 IST
--   2. a consumption and a return before it are not counted; the WinMax pool
--      dated 09-Jun-2022 is; a consumption at 01:00 IST on 09-Jun-2022 is
--   3. nothing is deleted: the old rows are still in their tables
--   4. close_handstock_period() divides the SAME instant (the 0096 rule)
--   5. a re-run never moves a later line backwards
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

update public.harness set uid = null, email = null;

\echo ''
\echo '--- 1. the line ---'
select 'the line' as t,
  (select closed_through = date '2022-06-08' from public.handstock_period) as closed_through_08_jun,
  public.handstock_cutoff() = timestamptz '2022-06-09 00:00+05:30' as at_midnight_ist;

insert into public.handstock_opening (engineer, part, qty, as_of, source) values
  ('ENG W412', 'MP-912|SENSOR', 5, '2022-06-09', 'WinMax HS');
insert into public.spare_consumption_history (engineer, part, qty, consumed_at, source, ref) values
  ('ENG W412', 'MP-912|SENSOR', 1, timestamptz '2022-03-07 10:00+05:30', 'test', 'W412-1'),
  ('ENG W412', 'MP-912|SENSOR', 1, timestamptz '2022-06-08 23:00+05:30', 'test', 'W412-2'),
  ('ENG W412', 'MP-912|SENSOR', 1, timestamptz '2022-06-09 01:00+05:30', 'test', 'W412-3'),
  ('ENG W412', 'MP-912|SENSOR', 1, timestamptz '2022-07-01 10:00+05:30', 'test', 'W412-4');
insert into public.material_returns (uid, engineer, part, good_qty, mrn_no, mrn_date) values
  ('W412-M1', 'ENG W412', 'MP-912|SENSOR', 2, 'MRN-W412', '2022-05-01');

\echo ''
\echo '--- 2. what counts ---'
select 'what counts' as t,
  (select opening = 5 from public.handstock_balance where engineer_key = public.handstock_key('ENG W412') and part_code = 'MP-912') as winmax_pool_counts,
  (select consumed = 2 from public.handstock_balance where engineer_key = public.handstock_key('ENG W412') and part_code = 'MP-912') as only_09_jun_01h_and_july_consumed,
  (select returned = 0 from public.handstock_balance where engineer_key = public.handstock_key('ENG W412') and part_code = 'MP-912') as may_return_not_counted,
  (select on_hand = 3 from public.handstock_balance where engineer_key = public.handstock_key('ENG W412') and part_code = 'MP-912') as on_hand_is_3;

\echo ''
\echo '--- 3. nothing deleted ---'
select 'nothing deleted' as t,
  (select count(*) = 4 from public.spare_consumption_history where engineer = 'ENG W412') as history_kept,
  (select count(*) = 1 from public.material_returns where uid = 'W412-M1') as return_kept;

\echo ''
\echo '--- 4. the close divides the same instant ---'
select 'same instant' as t,
  public.handstock_line(date '2022-06-08') = public.handstock_cutoff() as line_is_cutoff,
  position('handstock_line(p_through)' in pg_get_functiondef('public.close_handstock_period(date)'::regprocedure)) > 0 as close_reads_the_line;

\echo ''
\echo '--- 5. never backwards ---'
update public.handstock_period set closed_through = date '2023-12-31';
\i supabase/migrations/0412_handstock_starts_at_winmax.sql
select 'never backwards' as t,
  (select closed_through = date '2023-12-31' from public.handstock_period) as later_line_stands;
