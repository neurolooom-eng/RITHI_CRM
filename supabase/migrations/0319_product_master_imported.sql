-- ===========================================================================
-- 0319 — THE PRODUCT MASTER SAYS WHETHER A LINE IS IMPORTED
--
-- The user, 2026-10-02: "Pre-delivery check is done only for Imported
-- products, not for in-house manufactured equipment." Pre-Delivery Testing
-- (R/SER/QC/007) is owed by a DEMO unit in the workshop whose product line is
-- imported (0320, the indoor module), so the catalogue has to say which lines
-- are.
--
-- NULLABLE, AND BLANK UNTIL SOMEBODY FILLS IT. Nobody has said which of the 53
-- lines are imported, and a default either way would be a guess written into
-- the catalogue: TRUE would demand a test of in-house equipment, FALSE would
-- wave an imported unit out untested. NULL reads as "not known", the indoor
-- screen SAYS so on the job, and the dispatch rule treats it as not requiring
-- the test until the Product Master is filled (the user's decision).
--
-- WHO MAY SET IT: whoever may write a product line today -- pm_write, which
-- asks masters.edit.records (0290). No new key and no grant.
-- ===========================================================================

alter table public.product_master
  add column if not exists imported boolean;

comment on column public.product_master.imported is
  'Is this product line IMPORTED (true) or made in-house (false)? NULL = not recorded yet. Decides whether a DEMO unit of the line owes Pre-Delivery Testing R/SER/QC/007 before it leaves the workshop (0320); NULL is treated as not owing it, and the indoor screen says the answer is unknown.';
