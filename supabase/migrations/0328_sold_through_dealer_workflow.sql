-- ===========================================================================
-- 0328 — SOLD THROUGH IS THE DEALER, AND A DEALER GETS NO INSTALLATION CALL.
--
-- The user, 2026-10-03: "Sold through -- it is to monitor the equipments sold
-- through Dealer. Only party identified as dealer should be listed as part of
-- the drop down. We can have a sale entry done to a dealer, but we can not have
-- an installation call for a dealer. And eventually the dealer sells the
-- product / products to customer at that point in time we do a Ownership
-- transfer and then generate an installation call from the ownership transfer
-- entry ... OT-PRODUCT-SERIAL NO ... In Product Database and ownership
-- transfer, Warranty Sale Entry we need to have the field to monitor Sold
-- through Details." Asked: on a transfer, Sold Through is THE FROM PARTY when
-- that party is a dealer; the transfer's call is dated the transfer date; the
-- dealer rule is kept by the database as well as the screen; and the Sold
-- Through values 0318 cleared are put back.
--
-- A DEALER is a Party Master entry whose Type (parties.party_type) is DEALER,
-- matched by name the way every cover screen matches a party (name_key).
--
-- 1. ownership_transfers.sold_through, STAMPED: the From party when the Party
--    Master types it DEALER, otherwise blank. What a caller sends is discarded
--    -- the dealer is a fact about the From party, not something typed.
-- 2. THE PRODUCT DATABASE'S Sold Through follows the machine: the dealer on
--    its latest transfer that names one, else the sale line's, else the sale
--    entry's (machine_sold_through). upsert_product_from_sale (0238) and
--    transfer_to_product (0238) are redefined from the database's own
--    definitions with that one change, so a re-saved sale cannot wipe the
--    dealer a transfer recorded.
-- 3. AN INSTALLATION CALL IS REFUSED FOR A DEALER, by a trigger on
--    installation_calls, for any signed-in insert or a change of party --
--    however it is raised (the warranty page, the Field Call form, an upload).
--    The call is raised from the Ownership Transfer when the dealer sells the
--    machine, named OT-PRODUCT-SERIAL. Calls already raised are left as they
--    are; a migration (no session) is not refused.
-- 4. ONCE: the Sold Through 0318 took off machine lines is put back from
--    sale_items_inherit_backup -- for every line still following its entry
--    whose own value was blank on the entry (lost) or different (replaced).
--    Guarded by one_time_fixes_done, so a replayed bundle never repeats it.
-- ===========================================================================

-- ---- the dealer test, one place -------------------------------------------
create or replace function public.party_is_dealer(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(btrim(p_name), '') <> ''
     and exists (select 1 from public.parties p
                  where p.name_key = lower(btrim(p_name))
                    and upper(btrim(coalesce(p.party_type, ''))) = 'DEALER');
$$;
revoke execute on function public.party_is_dealer(text) from public, anon;
grant execute on function public.party_is_dealer(text) to authenticated;

-- ---- 1. Sold Through on a transfer ------------------------------------------
alter table public.ownership_transfers add column if not exists sold_through text not null default '';

create or replace function public.ownership_transfer_sold_through()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sold_through := case when public.party_is_dealer(new.from_party) then btrim(new.from_party) else '' end;
  return new;
end $$;
revoke execute on function public.ownership_transfer_sold_through() from public, anon, authenticated;
-- Named to fire AFTER ownership_transfer_biu, which fills a blank From party
-- from whoever holds the machine.
drop trigger if exists ownership_transfer_sold_through on public.ownership_transfers;
create trigger ownership_transfer_sold_through
  before insert or update on public.ownership_transfers
  for each row execute function public.ownership_transfer_sold_through();

-- Transfers already recorded get theirs.
update public.ownership_transfers
   set sold_through = case when public.party_is_dealer(from_party) then btrim(from_party) else '' end
 where sold_through is distinct from (case when public.party_is_dealer(from_party) then btrim(from_party) else '' end);

-- ---- 2. the Product Database follows the machine ---------------------------
create or replace function public.machine_sold_through(p_item_name text, p_serial text)
returns text language sql stable set search_path = public as $$
  select t.sold_through
    from public.ownership_transfers t
   where lower(btrim(coalesce(t.item_name, '')))     = lower(btrim(coalesce(p_item_name, '')))
     and lower(btrim(coalesce(t.serial_number, ''))) = lower(btrim(coalesce(p_serial, '')))
     and btrim(coalesce(t.sold_through, '')) <> ''
   order by coalesce(t.transferred_at, t.created_at, t.transfer_date::timestamptz) desc nulls last, t.id desc
   limit 1;
$$;

-- 0238's upsert_product_from_sale, read from the database, with Sold Through
-- taken from the machine's latest dealer transfer first.
create or replace function public.upsert_product_from_sale(p_item_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare i record; h record; v_party text;
begin
  select * into i from public.sale_items where id = p_item_id;
  if not found then return; end if;

  if btrim(coalesce(i.product_name, '')) = '' or btrim(coalesce(i.serial_number, '')) = '' then
    return;
  end if;

  select * into h from public.sale_entries where sa_number = i.sa_number;

  -- NOT h.party_name. A machine sold and later transferred belongs to whoever
  -- holds it now, and re-saving the sale must not hand it back to the buyer.
  v_party := public.machine_current_party(i.product_name, i.serial_number);

  insert into public.products as p (
    item_name, serial_number, party_name,
    item_code, warranty_number,
    warranty_start, warranty_end, warranty_status_keyed, pm_visits,
    sold_through, state, city, address, other_details, service_engineer)
  values (
    btrim(i.product_name), btrim(i.serial_number), coalesce(v_party, ''),
    coalesce(i.product_code, ''), coalesce(i.sa_number, ''),
    coalesce(i.warranty_start, h.warranty_start),
    coalesce(i.warranty_end,   h.warranty_end),
    coalesce(nullif(btrim(coalesce(i.warranty_status, '')), ''), h.warranty_status, ''),
    coalesce(i.pm_visits, h.pm_visits),
    -- THE DEALER A TRANSFER RECORDED wins (0328): re-saving the sale must not
    -- wipe it.
    coalesce(public.machine_sold_through(i.product_name, i.serial_number),
             nullif(btrim(coalesce(i.sold_through, '')), ''), h.sold_through, ''),
    coalesce(nullif(btrim(coalesce(i.state, '')), ''), h.state, ''),
    coalesce(nullif(btrim(coalesce(i.city,  '')), ''), h.city,  ''),
    coalesce(h.address, ''),
    coalesce(nullif(btrim(coalesce(i.other_details, '')), ''), h.other_details, ''),
    coalesce(nullif(btrim(coalesce(i.engineer, '')), ''), h.engineer, ''))
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
    service_engineer      = excluded.service_engineer;
  -- `inst_call` IS NO LONGER WRITTEN HERE AT ALL, and that reverses yesterday's
  -- rule at the user's instruction: the installation call now BELONGS to the
  -- machine only while it names the current owner, which is decided on read.
  -- The stored column keeps whatever the import put there, as the keyed value.
end $$;

-- 0238's transfer_to_product, read from the database, with the dealer carried
-- onto a machine that has no sale entry.
create or replace function public.transfer_to_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; m record;
begin
  m := case when tg_op = 'DELETE' then old else new end;
  for r in select i.id from public.sale_items i
            where lower(btrim(coalesce(i.product_name, ''))) = lower(btrim(coalesce(m.item_name, '')))
              and lower(btrim(coalesce(i.serial_number, ''))) = lower(btrim(coalesce(m.serial_number, ''))) loop
    perform public.upsert_product_from_sale(r.id);
  end loop;

  -- A machine with NO sale entry still changes hands, and the transfer is then
  -- the only thing that knows who owns it -- and, since 0328, which dealer it
  -- came through.
  update public.products p
     set party_name   = public.machine_current_party(p.item_name, p.serial_number),
         sold_through = coalesce(public.machine_sold_through(p.item_name, p.serial_number), p.sold_through)
   where p.machine_key = lower(btrim(coalesce(m.item_name, ''))) || '|' || lower(btrim(coalesce(m.serial_number, '')))
     and not exists (select 1 from public.sale_items i
                      where lower(btrim(coalesce(i.product_name, ''))) = lower(btrim(coalesce(m.item_name, '')))
                        and lower(btrim(coalesce(i.serial_number, ''))) = lower(btrim(coalesce(m.serial_number, ''))));
  return null;
end $$;

-- ---- 3. no installation call for a dealer -----------------------------------
create or replace function public.installation_call_not_for_dealer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- a migration, a repair
  if tg_op = 'UPDATE' and new.party_name is not distinct from old.party_name then return new; end if;
  if public.party_is_dealer(new.party_name) then
    raise exception '% is a dealer: an installation call is not raised for a dealer -- it is raised from the Ownership Transfer when the dealer sells the machine (OT-PRODUCT-SERIAL)', btrim(new.party_name)
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.installation_call_not_for_dealer() from public, anon, authenticated;
drop trigger if exists installation_call_not_for_dealer on public.installation_calls;
create trigger installation_call_not_for_dealer
  before insert or update on public.installation_calls
  for each row execute function public.installation_call_not_for_dealer();

-- ---- 4. once: Sold Through put back on the lines 0318 cleared ---------------
do $$
declare n int := 0;
begin
  if to_regclass('public.one_time_fixes_done') is null or to_regclass('public.sale_items_inherit_backup') is null then
    raise notice '0328: 0318 has not run here -- no Sold Through to put back (not marked done)';
    return;
  end if;
  if exists (select 1 from public.one_time_fixes_done where name = '0328_sold_through_restored') then
    raise notice '0328: Sold Through was put back before -- not touched again';
    return;
  end if;

  update public.sale_items i
     set sold_through = b.v
    from (select distinct on (k.item_id) k.item_id, btrim(k.before ->> 'sold_through') as v
            from public.sale_items_inherit_backup k
           where btrim(coalesce(k.before ->> 'sold_through', '')) <> ''
           order by k.item_id, k.id) b,
         public.sale_entries e
   where i.id = b.item_id
     and e.sa_number = i.sa_number
     -- still following its entry, as 0318 left it: an edit since is kept
     and i.sold_through is null
     -- lost (the entry has none) or replaced (the entry's differs)
     and btrim(coalesce(e.sold_through, '')) is distinct from b.v;
  get diagnostics n = row_count;

  insert into public.one_time_fixes_done (name, detail)
  values ('0328_sold_through_restored', format('%s machine line(s) given back their own Sold Through', n));
  raise notice '0328: % machine line(s) given back their own Sold Through', n;
end $$;
