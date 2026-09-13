-- ===========================================================================
-- 0181 — ONE PAPER REPORT CAN COVER SEVERAL MACHINES.
--
-- Found while loading the register back to 2016. Eight FFR numbers in the
-- 2016-2019 tabs appear on more than one row, and they are not mistakes:
--
--   16/18        serials 252, 253, 254, 255   (one ventilation-mode fault)
--   FQI-18-0113  serials 6326, 6327, 6329
--   11/19        three ORION-G at one hospital
--   02/19, 09/19, 10/18, FQI-18-0175, 08/16
--
-- One report was written, listing every unit that failed the same way. Keyed on
-- `ffr_no` alone, 20 rows became 8 and TWELVE MACHINES VANISHED -- not with an
-- error, but by being quietly overwritten by the next row carrying the same
-- number, which is the worst way for a quality record to disappear.
--
-- THE KEY BECOMES THE PAIR: the report number AND the machine it is about. Each
-- machine keeps its own serial and its own installation date, so a failure can
-- still be counted per unit, and re-loading a corrected year still updates its
-- rows rather than adding them again.
--
-- `product_serial` is already `not null default ''`, so this is a plain btree
-- over two columns -- no coalesce, no expression, nothing `check:upserts`
-- refuses as a conflict target, and two rows with no serial at all still
-- collide rather than silently multiplying on every re-load.
--
-- WHAT IS GIVEN UP, stated plainly: the database will no longer refuse a second
-- report that reuses a number with a different machine. That guarantee was
-- never doing the work it appeared to -- `next_ffr_no(yr)` issues the number
-- from the highest already on record for that year, and `ffr_stamp` refuses to
-- let an issued number be edited afterwards, so a report raised HERE still
-- cannot collide with another. What has changed is only that the HISTORICAL
-- shape, one number over several machines, is now representable.
-- ===========================================================================

alter table public.field_failure_reports
  drop constraint if exists field_failure_reports_ffr_no_key;

create unique index if not exists ffr_no_machine_uniq
  on public.field_failure_reports (ffr_no, product_serial);

comment on index public.ffr_no_machine_uniq is
  'The record is the report AND the machine. One paper FFR can cover several units (16/18 covers serials 252-255 in the 2018 register), so the number alone is not the identity — keying on it alone silently overwrote twelve machines on import.';
