-- ===========================================================================
-- 0322 — A STOCK TRANSFER LINE MAY CARRY ITS OWN REASON
--
-- The user, 2026-10-02, on the MATERIAL TRANSFER NOTE (R/SER/STR/003), whose
-- table has a "Reason for Transfer" column per item: "Optional to keep one
-- common remark or per item remark."
--
-- So the transfer keeps its one common Remarks (stock_transfers.remarks, "Why
-- the stock is moving…") and each line gains an OPTIONAL reason of its own.
-- The printed MTN reads the line's reason where one was given and the common
-- remarks otherwise -- a rule of the PRINT, not of the data: nothing is
-- copied, so a blank reason stays blank and says "no reason of its own".
--
-- Nothing else changes: the stock guard, the policies (stl_insert asks
-- stock.transfer as before), the balance views (which name their columns) and
-- the importer (whose file has no such column -- the default fills it).
-- ===========================================================================
alter table public.stock_transfer_lines
  add column if not exists reason text not null default '';

comment on column public.stock_transfer_lines.reason is
  'Optional reason for moving THIS part (0322). Blank = the transfer''s common remarks apply, which is what the printed MTN shows under Reason for Transfer.';
