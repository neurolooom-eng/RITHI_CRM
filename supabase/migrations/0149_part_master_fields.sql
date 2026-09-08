-- ===========================================================================
-- THE PART MASTER CARRIES WHAT THE ITEM MASTER HAS.
--
-- The user, 2026-09-08, on the Consumable/Spare split: "Ideally should be
-- Present in the Part Master, if its not then Use the Above File and also make
-- Provision to Record all the Fields in the Part Master."
--
-- The file loads TODAY -- the Part Master importer already reads `Item Code`,
-- `Item Details`, `Item Name`, `Active/Inactive?` and `Added On`, and drops
-- everything else into `extra` as free-form jsonb. That is why this migration
-- exists: a value in `extra` is KEPT but cannot be grouped, filtered or shown
-- as a column, so "Spare / Consumable" was in the database and still unusable.
-- Promoting them is the difference between storing a file and having its data.
--
-- WHAT COMES ACROSS, and why each is a column rather than a note:
--
--   product          the machine family (EXT, ORG, CPX, MT75…). 443 of 1,324
--                    rows have none, so it is nullable and stays that way.
--   purchase_cost    what the part costs. Consumption times cost is the next
--                    question anybody asks of the insight, and it cannot be
--                    asked of a jsonb blob.
--   purchase_cost_f  the same in foreign currency, as the file keeps it.
--   source_*         the old system's OWN audit stamps (added on/by, modified
--                    on, set to inactive on). Named `source_` so they can never
--                    be mistaken for this system's `created_at`: they say what
--                    AppSheet recorded, not what happened here.
--
-- `category` is in 0148 with the insight that reads it.
-- ===========================================================================

alter table public.parts
  add column if not exists product            text,
  add column if not exists purchase_cost      numeric,
  add column if not exists purchase_cost_f    numeric,
  add column if not exists source_added_by    text,
  add column if not exists source_added_on    timestamptz,
  add column if not exists source_modified_on timestamptz,
  add column if not exists source_inactive_on timestamptz;

-- The family is a filter on Part Master and a grouping in the insight; 443 of
-- 1,324 rows have none, so the index skips them rather than indexing a third
-- of the table as empty string.
create index if not exists parts_product_idx on public.parts (product) where product is not null and product <> '';

comment on column public.parts.product is
  'The machine family this part belongs to (EXT, ORG, CPX, MT75...), from the Item Master. Blank on about a third of the catalogue.';
comment on column public.parts.purchase_cost is
  'Purchase cost from the Item Master. Present on 560 of 1,324 rows, so any figure derived from it must say what it covers.';
comment on column public.parts.source_added_on is
  'When the SUPERSEDED system recorded this part. Not this system''s created_at, which is when the row arrived here.';
