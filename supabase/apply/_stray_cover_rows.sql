-- ===========================================================================
-- THE TWO STRAY COVER ROWS -- LOOK AT THEM, THEN REMOVE THEM.
--
-- The sweep found one row in Sale Details with uid 'SA-UNKNOWN||' and one in
-- Contract Details with 'MC-UNKNOWN||'. Both are the shape a report file makes
-- when it is loaded into a cover register: the register needs a document
-- number, the file has none, so it invents a placeholder and everything else
-- comes out blank.
--
-- WHAT I CANNOT TELL YOU, and will not pretend to: WHEN these arrived. The
-- placeholder is what ANY file with no SA/MC number produces, so they may be
-- from Report.csv or from some earlier mis-aimed upload. Section 1 prints them
-- in full, with their own timestamps, so you can see for yourself before
-- anything is deleted.
--
-- Section 2 is the delete, and it is narrowed twice: the exact uid AND the
-- blankness. If a real machine ever acquired that placeholder number, it has a
-- product or a serial and is not touched.
--
-- Run section 1 first. It changes nothing.
-- ===========================================================================

-- ---- 1. WHAT IS ACTUALLY THERE -------------------------------------------
select 'sale_items' as register, s.uid, s.sa_number as document_no,
       coalesce(nullif(s.product_name, ''), '(blank)')  as product,
       coalesce(nullif(s.serial_number, ''), '(blank)') as serial,
       s.created_at                                     as arrived,
       -- Does anything downstream read it? A machine is its model AND its
       -- serial, so a row with neither should reach neither view. Confirmed
       -- rather than assumed -- that is the point of looking first.
       (select count(*) from public.machine_cover mc where mc.serial_key = s.serial_number) as in_machine_cover
  from public.sale_items s
 where s.uid = 'SA-UNKNOWN||'
union all
select 'contract_items', c.uid, c.mc_number,
       coalesce(nullif(c.product_name, ''), '(blank)'),
       coalesce(nullif(c.serial_number, ''), '(blank)'),
       c.created_at,
       (select count(*) from public.machine_cover mc where mc.serial_key = c.serial_number)
  from public.contract_items c
 where c.uid = 'MC-UNKNOWN||';

-- ---- 2. REMOVE THEM ------------------------------------------------------
-- Narrowed on the uid AND on being blank, so a real record that somehow wore
-- the placeholder number survives. Neither table carries the retention guard
-- (0049 covers the call, visit, spare and feedback tables) -- these are cover
-- registers, rebuilt from their source files, not quality records.
--
-- AND NEITHER IS AUDITED. An earlier draft of this file said record_audit
-- would capture both deletes; running it showed that it does not. 0225 arms
-- the trail on the TEN QUALITY TABLES, and the cover registers are not among
-- them -- which is the right scope and makes the claim wrong, not the scope.
-- So section 1 IS the record of what was removed: run it, and keep the grid.
begin;

delete from public.sale_items
 where uid = 'SA-UNKNOWN||'
   and coalesce(btrim(product_name), '') = ''
   and coalesce(btrim(serial_number), '') = '';

delete from public.contract_items
 where uid = 'MC-UNKNOWN||'
   and coalesce(btrim(product_name), '') = ''
   and coalesce(btrim(serial_number), '') = '';

-- Read this BEFORE committing. Expect 0 and 0.
select (select count(*) from public.sale_items     where uid = 'SA-UNKNOWN||') as sale_left,
       (select count(*) from public.contract_items where uid = 'MC-UNKNOWN||') as contract_left;

commit;
