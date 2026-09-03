-- ===========================================================================
-- WHAT IS LOADED, AND DOES THE STOCK ADD UP?
--
-- Read-only. Run it after a round of uploads: it says what every register
-- holds, what each arm of the hand-stock balance contributes, and where the
-- balance lands — so a register that quietly loaded nothing, or twice, shows up
-- as a number rather than as a surprise three weeks later.
--
-- Expected from the 2026 + historical exports, once everything is in:
--
--   parties                 5,873      spare_requests        4,138
--   products               ~20,000     spare_request_lines   8,567
--   parts                    (master)  spare_issue_history  48,139
--   field/inst/pm calls      (as run)  handstock_opening     4,375
--   call_requests            (as run)  consumption history  39,801
--   reports                  (as run)  spare_consumption     8,352
--   material_returns           595     stock_transfers         338
--   masters                  (lists)   stock_transfer_lines    849
-- ===========================================================================

-- ---- 1. every register, by size -------------------------------------------
select 'parties'                   as register, count(*) from public.parties
union all select 'products',                   count(*) from public.products
union all select 'parts',                      count(*) from public.parts
union all select 'masters (value lists)',      count(*) from public.masters
union all select 'field_calls',                count(*) from public.field_calls
union all select 'installation_calls',         count(*) from public.installation_calls
union all select 'pm_calls',                   count(*) from public.pm_calls
union all select 'call_requests',              count(*) from public.call_requests
union all select 'reports (visits)',           count(*) from public.reports
union all select 'spare_requests',             count(*) from public.spare_requests
union all select 'spare_request_lines',        count(*) from public.spare_request_lines
union all select 'spare_issue_history',        count(*) from public.spare_issue_history
union all select 'handstock_opening',          count(*) from public.handstock_opening
union all select 'spare_consumption_history',  count(*) from public.spare_consumption_history
union all select 'spare_consumption (2026)',   count(*) from public.spare_consumption
union all select 'material_returns',           count(*) from public.material_returns
union all select 'stock_transfers',            count(*) from public.stock_transfers
union all select 'stock_transfer_lines',       count(*) from public.stock_transfer_lines
union all select 'ownership_transfers',        count(*) from public.ownership_transfers
order by 1;

-- ---- 2. the hand-stock arms ------------------------------------------------
-- WinMax HS + SO + ST received - Consumption - ST sent - MRN, one row each.
select direction, movement, ref_type, count(*) as rows, round(sum(qty)) as qty
  from public.handstock_movements
 group by 1, 2, 3
 order by 1 desc, 5 desc;

-- ---- 3. where that leaves the balance -------------------------------------
select count(*)                          as engineer_and_part_rows,
       count(distinct engineer_key)      as engineers,
       round(sum(on_hand))               as parts_in_hand,
       count(*) filter (where on_hand < 0) as negative_rows,
       round(sum(on_hand) filter (where on_hand < 0)) as negative_parts
  from public.handstock_balance
 where on_hand <> 0;

-- ---- 4. the value lists, one row each -------------------------------------
select name as list, count(*) as values
  from public.masters
 group by name
 order by name;
