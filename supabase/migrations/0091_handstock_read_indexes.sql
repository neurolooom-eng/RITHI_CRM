-- ===========================================================================
-- HAND STOCK STAYS DERIVED — and gets the indexes to afford it.
--
-- The balance is computed from the movement history on every read, never
-- stored. With the whole record loaded that history is ~103,000 rows, and the
-- plan showed why one engineer's stock still cost 22 ms: every arm filters on
-- `handstock_key(engineer)` and `part_code(part)` — EXPRESSIONS — so each source
-- table was sequentially scanned, however few rows the answer needed.
--
-- Both functions are IMMUTABLE, so they can be indexed. Measured on the full
-- load (4,375 opening + 48,139 issues + 39,724 historical + 8,352 2026
-- consumptions + the 2026 registers):
--
--   one engineer's hand stock         22 ms -> 10 ms
--   the spare picker (engineer_stock)          9 ms
--   entering a consumption (the CAP)  25-33 ms -> 14-19 ms
--   the whole Stock Levels screen    180 ms -> 160 ms
--
-- The last one barely moves, and should not: it aggregates everything, which is
-- a sequential scan by definition. It is the per-engineer paths that are on the
-- hot path — every consumption entry runs the cap, and every spare picker reads
-- one engineer's stock — and those are the ones that halve.
--
-- The tables the later migrations added (opening pools, consumption history,
-- issue history) already carry `engineer_key` / `part_code` as STORED generated
-- columns with indexes on them. These are the older ones, which do not.
-- ===========================================================================

create index if not exists spare_consumption_hs_idx
  on public.spare_consumption (public.handstock_key(engineer), public.part_code(part));

create index if not exists material_returns_hs_idx
  on public.material_returns (public.handstock_key(engineer), public.part_code(part));

create index if not exists spare_requests_hs_idx
  on public.spare_requests (public.handstock_key(engineer));

create index if not exists spare_dispatches_hs_idx
  on public.spare_dispatches (public.handstock_key(engineer));

create index if not exists stock_transfers_from_hs_idx
  on public.stock_transfers (public.handstock_key(from_engineer));

create index if not exists stock_transfers_to_hs_idx
  on public.stock_transfers (public.handstock_key(to_engineer));

create index if not exists stock_transfer_lines_part_hs_idx
  on public.stock_transfer_lines (public.part_code(part));

create index if not exists spare_request_lines_part_hs_idx
  on public.spare_request_lines (public.part_code(part));
