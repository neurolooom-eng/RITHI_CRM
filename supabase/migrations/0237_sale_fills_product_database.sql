-- ===========================================================================
-- A WARRANTY SALE PUTS ITS MACHINES INTO THE PRODUCT DATABASE.
--
-- The user, 2026-09-24: "Every time I add a Warranty Sale entry, all the
-- products should get added to the product database. There is an opportunity
-- that same product is sold again to a different customer, in that case the old
-- data should be over written. All fields should get updated in product
-- database as per the warranty sale details."
--
-- WHAT WAS THERE ALREADY, AND WHY IT WAS NOT ENOUGH. `sale_items` has fired
-- `sync_product_cover()` since 0036, and that function does an UPDATE: it
-- refreshes the cover of a machine ALREADY in the register and does nothing at
-- all for one that is not. So a machine sold today appeared in the Product
-- Database only if the AppSheet import had happened to carry it. The register
-- of what exists was being kept by an import rather than by the act of selling.
--
-- AND IT KEYS ON THE SERIAL ALONE, which this project settled long ago:
-- A MACHINE IS ITS MODEL AND ITS SERIAL. The install base holds eleven machines
-- numbered 219, so a serial-only match writes one sale's cover onto a different
-- model. This keys on `machine_key` -- the generated lower(model)|lower(serial)
-- -- which is the same key `products_machine_key_uniq` already enforces.
--
-- RE-SOLD TO A DIFFERENT CUSTOMER IS THE CASE THE ASK NAMES, and it falls out
-- of the key: the same model and serial is the same machine, so the upsert
-- finds the existing row and the new sale's party, dates and location replace
-- the previous owner's. That is the whole point -- the Product Database says
-- who has the machine NOW.
--
-- WHAT IT WRITES IS WHAT THE SALE KNOWS, AND ONLY THAT.
--
--   written:  party, model, serial, product code, SA number, warranty start /
--             end / status, PM visits, sold through, state, city, address,
--             other details, the sale's engineer, and the installation call.
--   NOT written: everything about the CONTRACT (the sale knows nothing about
--             it and a blank would erase real cover), `extra` (the import's
--             kept columns), `item_status` (worked out on read since 0235, and
--             the stored value is the migrated system's own answer, preserved
--             deliberately as item_status_keyed), and `active`.
--
-- A BLANK ON THE SALE IS WRITTEN AS A BLANK, and that is deliberate rather than
-- careless: "all fields ... as per the warranty sale details" is the ask, and on
-- a RE-SALE the alternative is worse -- keeping the previous owner's city
-- against the new owner's machine is not stale data, it is wrong data about
-- somebody else.
--
-- ONE THING THIS CHANGES THAT NOBODY ASKED FOR, said plainly rather than
-- buried: an OWNERSHIP TRANSFER also writes products.party_name, and a later
-- edit to the sale will now overwrite it with the sale's party. The transfer
-- row is untouched and the machine's history is intact, but the Product
-- Database would show the original buyer again. It only happens if somebody
-- edits that sale after the transfer; if that is wrong for this business, the
-- rule to add is "do not overwrite the party where a transfer is dated after
-- the sale", and it is one clause.
-- ===========================================================================

create or replace function public.upsert_product_from_sale(p_item_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare i record; h record;
begin
  select * into i from public.sale_items where id = p_item_id;
  if not found then return; end if;

  -- A MACHINE IS ITS MODEL AND ITS SERIAL. A line with either missing is not a
  -- machine yet -- a half-typed row on an open entry -- and putting it in the
  -- install base would create a product nobody can identify.
  if btrim(coalesce(i.product_name, '')) = '' or btrim(coalesce(i.serial_number, '')) = '' then
    return;
  end if;

  select * into h from public.sale_entries where sa_number = i.sa_number;

  insert into public.products as p (
    item_name, serial_number, party_name,
    item_code, warranty_number,
    warranty_start, warranty_end, warranty_status_keyed, pm_visits,
    sold_through, state, city, address, other_details,
    service_engineer, inst_call)
  values (
    btrim(i.product_name), btrim(i.serial_number), coalesce(h.party_name, ''),
    coalesce(i.product_code, ''), coalesce(i.sa_number, ''),
    -- The EFFECTIVE value: the machine's own where it pinned one, else the
    -- entry's. That is the inheritance the registers already show on screen
    -- (0036), so the Product Database agrees with what the operator is reading.
    coalesce(i.warranty_start, h.warranty_start),
    coalesce(i.warranty_end,   h.warranty_end),
    coalesce(nullif(btrim(coalesce(i.warranty_status, '')), ''), h.warranty_status, ''),
    coalesce(i.pm_visits, h.pm_visits),
    coalesce(nullif(btrim(coalesce(i.sold_through, '')), ''), h.sold_through, ''),
    coalesce(nullif(btrim(coalesce(i.state, '')), ''), h.state, ''),
    coalesce(nullif(btrim(coalesce(i.city,  '')), ''), h.city,  ''),
    coalesce(h.address, ''),
    coalesce(nullif(btrim(coalesce(i.other_details, '')), ''), h.other_details, ''),
    coalesce(nullif(btrim(coalesce(i.engineer, '')), ''), h.engineer, ''),
    coalesce(i.inst_call, ''))
  on conflict (machine_key) do update set
    party_name            = excluded.party_name,
    item_code             = excluded.item_code,
    warranty_number       = excluded.warranty_number,
    warranty_start        = excluded.warranty_start,
    warranty_end          = excluded.warranty_end,
    warranty_status_keyed = excluded.warranty_status_keyed,
    pm_visits             = excluded.pm_visits,
    sold_through          = excluded.sold_through,
    state                 = excluded.state,
    city                  = excluded.city,
    address               = excluded.address,
    other_details         = excluded.other_details,
    service_engineer      = excluded.service_engineer,
    -- THE ONE FIELD THAT IS NEVER TAKEN BACKWARDS. 0234's rule: a UCN already
    -- on the machine is a call that exists, and a sale re-saved with a blank
    -- INST Call would orphan it. A real UCN on the sale still replaces one.
    inst_call             = case when public.is_call_number(excluded.inst_call)
                                 then excluded.inst_call else p.inst_call end;
end $$;

comment on function public.upsert_product_from_sale(bigint) is
  'Puts one Warranty Sale machine into the Product Database, keyed on MODEL + SERIAL, overwriting what the sale knows and leaving the contract, `extra` and item_status alone.';

-- ---- the two triggers ------------------------------------------------------
-- THE ITEM, for a machine added, corrected or re-serialled.
create or replace function public.sale_item_to_product()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.upsert_product_from_sale(new.id);
  return null;
end $$;

drop trigger if exists zz_sale_item_to_product on public.sale_items;
create trigger zz_sale_item_to_product
  after insert or update on public.sale_items
  for each row execute function public.sale_item_to_product();

-- THE ENTRY, because the party, the address and the warranty dates live on the
-- HEADER and every machine under it inherits them: correcting the customer on
-- the entry has to reach all of its machines, not none of them.
create or replace function public.sale_entry_to_products()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.sale_items where sa_number = new.sa_number loop
    perform public.upsert_product_from_sale(r.id);
  end loop;
  return null;
end $$;

drop trigger if exists zz_sale_entry_to_products on public.sale_entries;
create trigger zz_sale_entry_to_products
  after insert or update on public.sale_entries
  for each row execute function public.sale_entry_to_products();

-- ---- the machines already on the register ----------------------------------
-- EVERY SALE LINE ALREADY FILED, brought into the Product Database once. A rule
-- that only applies to sales made after today would leave the register as two
-- kinds of machine, and nothing on screen would say which.
--
-- OLDEST SALE FIRST, so where a machine really has been sold twice the LATEST
-- sale is the one that lands -- the same answer the trigger gives from now on.
do $$
declare r record; n bigint := 0;
begin
  if to_regclass('public.sale_items') is null then return; end if;
  for r in select i.id from public.sale_items i
            left join public.sale_entries h on h.sa_number = i.sa_number
           where btrim(coalesce(i.product_name, '')) <> ''
             and btrim(coalesce(i.serial_number, '')) <> ''
           order by coalesce(h.entry_at, i.created_at) nulls first, i.id loop
    perform public.upsert_product_from_sale(r.id);
    n := n + 1;
  end loop;
  raise notice '0237: % sale machine(s) put into the Product Database.', n;
end $$;
