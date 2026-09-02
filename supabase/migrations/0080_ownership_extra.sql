-- ===========================================================================
-- Ownership Transfer: keep what the export carries.
--
-- The real hand-over export has 28 columns the register has no field for — the
-- OT number's warranty and SA context, the engineer, the city, the state, the
-- file upload. `ownership_transfers` had nowhere to put them, so the upload
-- reported "this register has nowhere to put them" and they would have been
-- dropped on the floor.
--
-- A hand-over is a record of provenance. Losing the paperwork around it because
-- the table happened to have no column is exactly the kind of quiet loss the
-- rest of the import is careful to avoid, so the row keeps what it came with.
-- ===========================================================================

alter table public.ownership_transfers add column if not exists extra jsonb not null default '{}'::jsonb;

comment on column public.ownership_transfers.extra is
  'Everything the source export carried that has no field of its own, kept as written.';

-- The stock-transfer register has the same gap: its export carries the
-- timestamp, the raising engineer's email, the MTN number and the uploaded
-- document, none of which had a field.
alter table public.stock_transfers add column if not exists extra jsonb not null default '{}'::jsonb;
comment on column public.stock_transfers.extra is
  'Everything the source export carried that has no field of its own, kept as written.';
