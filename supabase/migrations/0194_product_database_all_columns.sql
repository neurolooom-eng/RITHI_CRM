-- ===========================================================================
-- 0194 — THE PRODUCT DATABASE KEEPS EVERY COLUMN OF ITS EXPORT.
--
-- The user, 2026-09-14: "Product Database has to retain all Columns - Attached
-- a Sample. [v2_ProdMaster (1).csv]".
--
-- Measured against that sample rather than guessed: the export has 32 columns
-- and eleven of them had a column here. THE OTHER TWENTY-ONE WERE NOT LOST —
-- the importer is `extraInto: 'extra'` and has been keeping every unnamed
-- heading under its own spelling — but a value in a jsonb blob cannot be
-- sorted, filtered, grouped or shown as a column. It is present and unusable,
-- which is the same fault 0148 fixed for the Part Master:
--
--     "a value in a jsonb blob cannot be grouped, filtered or shown as a
--      column, so 'Spare / Consumable' was in the database and unusable"
--
-- SO THE BACKFILL MATTERS AS MUCH AS THE COLUMNS. Every machine already loaded
-- carries these values in `extra` right now, so this reads them back out — the
-- same move 0190 made for the feedback dates, and for the same reason: nobody
-- should have to re-upload to get at what the importer already kept.
--
-- `extra` IS NOT EMPTIED. A column that now exists is still left in `extra`
-- as it arrived, because the two answer different questions: the column is what
-- this system holds, `extra` is what the FILE SAID. When they disagree — a bad
-- date, a value the parser could not read — the file's own words are the
-- evidence, and deleting them would destroy the only record of what was
-- actually supplied.
--
-- THREE THAT ARE NOT SIMPLY TEXT, and each is a decision:
--
--   `item_code`       the Product Database had NO product code at all. It is
--                     what joins a machine to its line on the new Product
--                     Master (0193), so it is the one that unlocks the other
--                     register rather than merely displaying.
--   `warranty_status_keyed` / `contract_status_keyed`
--                     the export's OWN "ACTIVE"/"INACTIVE" text. NOT the same
--                     as the state this system computes from the dates, and
--                     named `_keyed` so the two can never be mistaken for one
--                     another — the cover registers make exactly this
--                     distinction already.
--   `pm_visits`       an integer, because it is counted. A blank stays NULL
--                     rather than becoming 0: "nobody said" and "none" are
--                     different answers about a service schedule.
-- ===========================================================================

alter table public.products
  add column if not exists item_code              text not null default '',
  add column if not exists item_details_long      text not null default '',
  add column if not exists item_details           text not null default '',
  add column if not exists sold_through           text not null default '',
  add column if not exists state                  text not null default '',
  add column if not exists city                   text not null default '',
  add column if not exists address                text not null default '',
  add column if not exists po_no                  text not null default '',
  add column if not exists po_date                date,
  add column if not exists warranty_status_keyed  text not null default '',
  add column if not exists contract_status_keyed  text not null default '',
  add column if not exists pm_visits              integer,
  add column if not exists other_details          text not null default '',
  add column if not exists service_engineer       text not null default '',
  add column if not exists prod_final             text not null default '',
  add column if not exists installation_completed text not null default '',
  add column if not exists inst_call              text not null default '',
  add column if not exists inst_date              date,
  add column if not exists inst_call_status       text not null default '',
  add column if not exists report                 text not null default '',
  add column if not exists associated_accessory   text not null default '';

comment on column public.products.item_code is
  'The product CODE. Joins this machine to its line on public.product_master (0193) — the Product Database had none until 0194.';
comment on column public.products.warranty_status_keyed is
  'The export''s own ACTIVE/INACTIVE text. NOT the state this system computes from the dates; the two can disagree and the disagreement is worth seeing.';
comment on column public.products.contract_status_keyed is
  'As warranty_status_keyed, for the contract.';
comment on column public.products.pm_visits is
  'How many PM visits the cover carries. NULL means nobody said, which is not the same as none.';

-- The code is how a machine reaches its product line, so it is worth an index.
create index if not exists products_item_code_idx on public.products (item_code);

-- ---------------------------------------------------------------------------
-- THE BACKFILL, out of `extra` and into the columns.
--
-- Idempotent: it only fills a column that is still EMPTY, so running it again
-- changes nothing and it can never overwrite a value somebody has since
-- corrected on screen. `extra` is read, never written.
--
-- THE DATES ARE GUARDED ON THEIR SHAPE. `to_date('rubbish','DD Mon YY')` does
-- not return null, it RAISES — so one unreadable cell in twenty thousand would
-- fail the whole migration. The sample writes them `02 Sep 23`, which is
-- `DD Mon YY`; anything not matching that shape is left for somebody to look
-- at, and is still in `extra` verbatim.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  if to_regclass('public.products') is null then return; end if;

  update public.products p set
    item_code              = coalesce(nullif(p.item_code, ''),              btrim(coalesce(p.extra->>'Item Code', ''))),
    item_details_long      = coalesce(nullif(p.item_details_long, ''),      btrim(coalesce(p.extra->>'Item Details Long', ''))),
    item_details           = coalesce(nullif(p.item_details, ''),           btrim(coalesce(p.extra->>'Item Details', ''))),
    sold_through           = coalesce(nullif(p.sold_through, ''),           btrim(coalesce(p.extra->>'Sold Through', ''))),
    state                  = coalesce(nullif(p.state, ''),                  btrim(coalesce(p.extra->>'State', ''))),
    city                   = coalesce(nullif(p.city, ''),                   btrim(coalesce(p.extra->>'City', ''))),
    address                = coalesce(nullif(p.address, ''),                btrim(coalesce(p.extra->>'Address', ''))),
    po_no                  = coalesce(nullif(p.po_no, ''),                  btrim(coalesce(p.extra->>'PO No.', p.extra->>'PO No', ''))),
    warranty_status_keyed  = coalesce(nullif(p.warranty_status_keyed, ''),  btrim(coalesce(p.extra->>'Warranty Status', ''))),
    contract_status_keyed  = coalesce(nullif(p.contract_status_keyed, ''),  btrim(coalesce(p.extra->>'Contract Status', ''))),
    other_details          = coalesce(nullif(p.other_details, ''),          btrim(coalesce(p.extra->>'Other Details', ''))),
    service_engineer       = coalesce(nullif(p.service_engineer, ''),       btrim(coalesce(p.extra->>'Service Engineer', ''))),
    prod_final             = coalesce(nullif(p.prod_final, ''),             btrim(coalesce(p.extra->>'ProdFinal', ''))),
    installation_completed = coalesce(nullif(p.installation_completed, ''), btrim(coalesce(p.extra->>'Installation Completed?', ''))),
    inst_call              = coalesce(nullif(p.inst_call, ''),              btrim(coalesce(p.extra->>'INST Call', ''))),
    inst_call_status       = coalesce(nullif(p.inst_call_status, ''),       btrim(coalesce(p.extra->>'INST Call Status', ''))),
    report                 = coalesce(nullif(p.report, ''),                 btrim(coalesce(p.extra->>'Report', ''))),
    associated_accessory   = coalesce(nullif(p.associated_accessory, ''),   btrim(coalesce(p.extra->>'Associated Accessory', '')))
   where p.extra <> '{}'::jsonb;
  get diagnostics n = row_count;
  raise notice '0194: % machine(s) had their kept columns read back out of `extra`', n;

  -- A COUNT, so a blank stays NULL. "Nobody said" and "none" are different
  -- answers about a service schedule.
  update public.products p
     set pm_visits = (btrim(p.extra->>'PM Visits'))::int
   where p.pm_visits is null
     and btrim(coalesce(p.extra->>'PM Visits', '')) ~ '^\d{1,4}$';

  -- The two dates, guarded on the sample's own shape (`02 Sep 23`).
  update public.products p
     set po_date = to_date(btrim(p.extra->>'PO Date'), 'DD Mon YY')
   where p.po_date is null
     and btrim(coalesce(p.extra->>'PO Date', '')) ~ '^\d{1,2} [A-Za-z]{3} \d{2}$';
  update public.products p
     set inst_date = to_date(btrim(p.extra->>'INST Date'), 'DD Mon YY')
   where p.inst_date is null
     and btrim(coalesce(p.extra->>'INST Date', '')) ~ '^\d{1,2} [A-Za-z]{3} \d{2}$';
end $$;
