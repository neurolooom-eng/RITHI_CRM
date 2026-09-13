-- ===========================================================================
-- 0184 — AN OWNERSHIP TRANSFER GETS A KEY, SO A RE-IMPORT CORRECTS IT.
--
-- The user, 2026-09-13: "In Ownership Transfer there can be a situation where
-- the Warranty Date or Period is changed. So ideally import everything —
-- create a key and import."
--
-- The upload screen has been saying so itself: "No natural key: a second run
-- adds rows rather than correcting them." The register carries the warranty
-- context from the sale (StartDate(SA), Period(SA), EndDate(SA) and the rest
-- are kept on the row), and that context is RESTATED every time the export is
-- taken. Without a key, correcting one warranty period means the whole file
-- arrives a second time.
--
-- THE KEY IS THE OT NUMBER AND THE MACHINE, not the OT number alone. One
-- hand-over document can cover several machines — the same shape the Field
-- Failure Register turned out to have (0181), where keying on the document
-- number alone silently overwrote twelve machines. The grain of this record is
-- "this machine changed hands under this paperwork", and that is the pair.
--
-- A PLAIN BTREE over two columns: `serial_number` is `not null` and
-- `reference_no` is `not null default ''`, so there are no NULLs to stop rows
-- colliding, and nothing here is an expression or a partial index — both of
-- which `check:upserts` refuses as a conflict target, for the good reason that
-- PostgREST cannot infer them.
--
-- WHAT THIS DOES NOT DO: it does not decide which of two hand-overs of the same
-- machine under the SAME OT number is right — it makes them one row, because
-- they are one record stated twice. A row with no OT number at all cannot be
-- matched on a re-run and the importer holds it back and names it, the same
-- rule the Field Failure Register already uses for a missing FFR number: a row
-- that cannot be corrected is a row that arrives again on every load.
-- ===========================================================================

-- Existing duplicates would stop the index being built, and they are exactly
-- what this file exists to prevent: collapse them first, keeping the row most
-- recently recorded, since a re-import is a correction of what came before.
delete from public.ownership_transfers a
 using public.ownership_transfers b
 where a.reference_no = b.reference_no
   and a.serial_number = b.serial_number
   and a.id < b.id;

create unique index if not exists ownership_transfer_key_uniq
  on public.ownership_transfers (reference_no, serial_number);

comment on index public.ownership_transfer_key_uniq is
  'The hand-over document AND the machine. One OT can cover several machines, so the number alone is not the identity — the same shape 0181 found in the Field Failure Register. It is what lets a corrected export (a changed warranty period, say) update these rows rather than arrive again.';
