-- ===========================================================================
-- LOOKING UP ONE MACHINE BY ITS SERIAL IS AN EQUALITY, AND IT WAS A SUBSTRING.
--
-- Reported 2026-09-07: "Could not prepare registration: canceling statement due
-- to statement timeout", on Pending Registrations, again.
--
-- Registering a call from a request validates the machine against Product
-- Master by serial. It asked for `serial_number ILIKE '%5054%'` — a
-- leading-wildcard substring scan over every machine — and then picked the
-- EXACT row out of the answer in the browser. Two things follow, and the
-- timeout is the less serious one:
--
--   * A 4-character pattern has almost no trigrams to go on, so the trigram
--     index (0052) returns most of the table as candidates and the planner
--     gives up and scans. At ~21k machines that crosses `authenticated`'s
--     statement timeout, and Supabase cancels it. The register grows, so this
--     gets worse, which is why it keeps coming back.
--   * It asked for the first 25 matches and then looked for the exact serial
--     among them. A serial that 25 OTHER serials contain as a substring was
--     never found at all — reported as "not in Product Master", warranty and
--     contract silently not filled in, on a call that had them.
--
-- WHY THE EARLIER FIXES DID NOT REACH IT. 0037 indexed
-- `lower(trim(serial_number))` for the cover import; 0052 added trigram
-- indexes for SEARCH; 0079/0082 added btree keys so the UPSERTS could infer a
-- target. Every one of them was about a query that says `=`. This call site
-- says `ILIKE '%…%'`, so no index built for equality was ever consulted. The
-- gotcha in CLAUDE.md — "substring search needs pg_trgm; `=`/`IN` needs a
-- btree" — inverted: the code asked for a substring when it meant equality.
--
-- THE FIX IS A COLUMN, NOT AN INDEX. `products_serial_key_idx` (0037) is an
-- EXPRESSION index, and PostgREST cannot express `lower(trim(serial_number))`
-- in a filter — so a client can never use it. A stored generated column can be
-- filtered on directly and is indexed like any other, which is exactly what
-- 0077 did for `product_additional_entries` and for the same reason.
--
-- The expression index stays: `sync_product_cover` still joins on
-- `lower(trim(serial_number))`, and that is its index.
-- ===========================================================================

alter table public.products
  add column if not exists serial_key text
    generated always as (lower(btrim(coalesce(serial_number, '')))) stored;

create index if not exists products_serial_key_col_idx
  on public.products (serial_key) where serial_key <> '';

comment on column public.products.serial_key is
  'lower(btrim(serial_number)), stored, so a client can look one machine up by serial as an EQUALITY on an indexed column. The expression index products_serial_key_idx (0037) cannot be reached through PostgREST; this can.';
