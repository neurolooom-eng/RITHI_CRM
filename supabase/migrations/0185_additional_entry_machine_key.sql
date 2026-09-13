-- ===========================================================================
-- 0185 — A RECOVERED ENTRY IS KEYED ON THE MACHINE, NOT THE SERIAL.
--
-- Reported from use, loading the AppSheet AdditionalEntryDetails export:
-- "Nothing loadable — every row is missing serial number."
--
-- The missing-serial part was an alias gap in the importer (the file says
-- "Product Serial Number"). Fixing that exposed the real fault underneath, and
-- MEASURING THE FILE is what found it rather than reading the SQL:
--
--   2,263 rows          1,920 distinct serials
--   298 serials belong to MORE THAN ONE PRODUCT
--   -> 640 rows would collapse to 298. THREE HUNDRED AND FORTY-TWO MACHINES
--      would vanish, silently, on a load that reported success.
--
-- Serial 15 is an ANAVENT and an ORION. Serial 239 is four different machines.
--
-- THIS PROJECT ALREADY KNOWS THE RULE and wrote it down in src/lib/machine.ts:
-- "A machine is its MODEL plus its SERIAL, never the serial alone. Serials
-- repeat across models — the install base has eleven machines numbered 219 —
-- so keying on the number alone points at a different machine, usually at a
-- different hospital." It records the incident: an ORION-G 201 request offered
-- an open call for VEGA 201, one click from being mapped onto it.
--
-- 0077 keyed this table on `serial_key` alone, which contradicts that rule. The
-- identity is the PAIR, exactly as it is for `products` and for the Field
-- Failure Register (0181) and Ownership Transfer (0184) before it.
--
-- `machine_key` is GENERATED and STORED, so it is a plain btree — not an
-- expression index, which `check:upserts` refuses because PostgREST cannot
-- infer one. Both parts are not-null (item_name defaults to ''), so there are
-- no NULLs to stop two rows colliding.
--
-- AND A PLACE FOR WHAT THE FILE ALSO CARRIES. The export has twenty-four
-- columns; this table names nine of them. The rest — AE Number, the warranty
-- period, PM VISITS, ACCESSORIES INCLUDED?, Already Sold TO — were being
-- DROPPED, because this register had no `extra`. Every other importer here
-- keeps what it does not recognise; this one now does too.
-- ===========================================================================

alter table public.product_additional_entries
  add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.product_additional_entries
  add column if not exists machine_key text
    generated always as (lower(btrim(item_name)) || '|' || lower(btrim(serial_number))) stored;

-- Existing rows first: the index cannot be built over duplicates, and a pair
-- appearing twice is one machine recorded twice, so the LATEST row wins — a
-- second recovered entry is a correction of the first, which is what 0073 says.
delete from public.product_additional_entries a
 using public.product_additional_entries b
 where lower(btrim(a.item_name)) = lower(btrim(b.item_name))
   and lower(btrim(a.serial_number)) = lower(btrim(b.serial_number))
   and a.id < b.id;

create unique index if not exists product_additional_entries_machine_key_uniq
  on public.product_additional_entries (machine_key);

-- The serial-only key goes, or the pair cannot hold two machines sharing a
-- serial — which is the whole point of this file.
drop index if exists public.product_additional_entries_serial_key_uniq;

comment on index public.product_additional_entries_machine_key_uniq is
  'The MODEL and the SERIAL. Serials repeat across models (src/lib/machine.ts), and the AdditionalEntryDetails export proves it: 298 of its serials belong to more than one product, so a serial-only key lost 342 machines.';
