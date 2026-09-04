-- ===========================================================================
-- THE BALANCE SAYS HOW MUCH OF ITSELF CAME FROM THE IMPORTED RECORD.
--
-- Hand stock is derived from nine arms, and three of them are not this system's
-- own record at all — they are the sheet era, loaded once:
--
--   Opening balance   handstock_opening   the WinMax pool and the yearly ones
--   Historical        spare_issue_history  every stock out before 2026
--   Historical        spare_consumption_history  the yearly consumption exports
--
-- Those three carry hundreds of thousands of parts between them, and a level
-- that looks wrong is usually a question about THEM: an export that was loaded
-- twice, a year that was never loaded, a stock out with no matching
-- consumption. Until now the register could not tell you which part of a number
-- came from where, so "the levels are incorrect" had nowhere to go.
--
-- These four columns split it. `on_hand_live` is the same derivation with the
-- imported record left out — what this application has recorded itself, since
-- 2026 — and it is the honest answer to "ignore the history and show me what we
-- know". It is NOT a correction: both numbers are true, of different questions.
--
-- APPENDED, not inserted. `create or replace view` can only add columns at the
-- end — putting one in the middle fails with "cannot change name of view
-- column" and takes everything that depends on the view with it.
-- ===========================================================================

create or replace view public.handstock_balance as
  select engineer_key,
         max(engineer) as engineer,
         max(engineer_email) as engineer_email,
         part_code,
         coalesce(max(part) filter (where movement = 'Stock out'), max(part)) as part,
         sum(case when movement = 'Stock out'    then qty else 0 end) as stock_out,
         sum(case when movement = 'Consumption'  then qty else 0 end) as consumed,
         sum(case when movement = 'Transfer in'  then qty else 0 end) as transferred_in,
         sum(case when movement = 'Transfer out' then qty else 0 end) as transferred_out,
         sum(case when movement = 'Return'       then qty else 0 end) as returned,
         sum(case when direction = 'IN' then qty else -qty end) as on_hand,
         max(moved_at) filter (where direction = 'IN')  as last_in,
         max(moved_at) filter (where direction = 'OUT') as last_out,
         max(moved_at) as last_movement,
         count(*) as movements,
         sum(case when movement = 'Opening' then qty else 0 end) as opening,
         -- ---- appended: where the number came from -------------------------
         -- The imported stock outs (spare_issue_history), separately from the
         -- ones this system issued on a DC of its own.
         sum(case when ref_type = 'Historical' and movement = 'Stock out'
                  then qty else 0 end) as hist_stock_out,
         -- The imported consumption (the yearly exports).
         sum(case when ref_type = 'Historical' and movement = 'Consumption'
                  then qty else 0 end) as hist_consumed,
         -- Everything the sheet era contributes, in one figure: the opening
         -- pools plus the imported stock outs, less the imported consumption.
         sum(case when ref_type in ('Historical', 'Opening balance')
                  then (case when direction = 'IN' then qty else -qty end)
                  else 0 end) as hist_net,
         -- The same balance with the sheet era left out. Both are true; this
         -- one answers "what has this system itself recorded".
         sum(case when ref_type in ('Historical', 'Opening balance') then 0
                  else (case when direction = 'IN' then qty else -qty end)
             end) as on_hand_live
    from public.handstock_movements m
   where engineer_key <> '' and part_code <> ''
   group by engineer_key, part_code;

-- `create or replace view` does NOT carry security_invoker over, and a balance
-- read as its owner would hand every engineer everybody else's stock.
alter view public.handstock_balance set (security_invoker = on);
grant select on public.handstock_balance to authenticated;
