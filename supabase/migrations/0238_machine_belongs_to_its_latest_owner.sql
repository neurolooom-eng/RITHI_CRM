-- ===========================================================================
-- A MACHINE BELONGS TO WHOEVER OWNS IT NOW, AND SO DOES EVERYTHING ATTACHED.
--
-- The user, 2026-09-24:
--   "What should be displayed is entirely based on the Timestamp of when the
--    change was done. When a new sale entry is added [Resold machine] .. it
--    should remove contract, installation call and every other details attached
--    as part of the product previously. Or let's say Contract has to match the
--    product, serial no, party.. Same with Installation calls -- it should match
--    Product, serial no, party .. and party is decided by sale entry or
--    ownership transfer whichever is latest."
--
-- THE SECOND SENTENCE IS THE MECHANISM FOR THE FIRST, and taking it that way is
-- what makes this safe. A re-sale does not DELETE the old contract and the old
-- installation call; they simply stop matching, because they name the previous
-- owner. Nothing is destroyed, the contract register is untouched, and if the
-- machine ever comes back to that customer its cover reappears by itself. A
-- rule that deletes cannot do any of that.
--
-- TWO HALVES, KEPT APART ON PURPOSE:
--
--   THE PARTY IS STORED (0237's upsert, extended here). It is decided by two
--   TIMESTAMPED EVENTS -- the sale entry and the ownership transfer -- so it
--   does not decay: nothing about it changes because a day passed. Storing a
--   value that only moves when somebody records something is honest.
--
--   THE CONTRACT AND THE INSTALLATION CALL ARE MATCHED ON READ, in
--   `product_database`. They depend on the party, and the party can change, so
--   deriving them where they are read means they can never disagree with it.
--   It also means no trigger on `installation_calls` or `contract_items` --
--   two of the highest-volume tables here, where a per-row trigger would make
--   a twelve-thousand-row import pay for this rule twelve thousand times.
--
-- SAME DAY? THE TRANSFER WINS. `transfer_date` is a DATE and a sale entry is a
-- TIMESTAMP, so a transfer recorded on the day of a sale would otherwise lose
-- to it at midnight. You cannot transfer a machine before selling it, so a
-- transfer bearing the same date is the later event.
--
-- A MACHINE WITH NEITHER A SALE NOR A TRANSFER IS LEFT ENTIRELY ALONE. Twenty
-- thousand machines came from the AppSheet import and have no sale entry
-- behind them; deriving their party from registers that do not mention them
-- would blank the only record of who owns them.
-- ===========================================================================

-- ---- 1. the party is the latest event's -----------------------------------
create or replace function public.machine_current_party(p_item_name text, p_serial text)
returns text language sql stable set search_path = public as $$
  with m as (select lower(btrim(coalesce(p_item_name, ''))) as n,
                    lower(btrim(coalesce(p_serial, '')))    as s),
  sale as (
    select coalesce(h.party_name, '') as party, coalesce(h.entry_at, i.created_at) as at
      from public.sale_items i
      join public.sale_entries h on h.sa_number = i.sa_number, m
     where lower(btrim(coalesce(i.product_name, ''))) = m.n
       and lower(btrim(coalesce(i.serial_number, ''))) = m.s
     order by coalesce(h.entry_at, i.created_at) desc nulls last, i.id desc
     limit 1),
  xfer as (
    select coalesce(t.to_party, '') as party, t.transfer_date as on_date
      from public.ownership_transfers t, m
     where lower(btrim(coalesce(t.item_name, ''))) = m.n
       and lower(btrim(coalesce(t.serial_number, ''))) = m.s
       and btrim(coalesce(t.to_party, '')) <> ''
     order by t.transfer_date desc nulls last, t.id desc
     limit 1)
  -- THE TRANSFER WINS A TIE, for the reason at the top of this file.
  select case
    when not exists (select 1 from xfer) then (select party from sale)
    when not exists (select 1 from sale) then (select party from xfer)
    when (select on_date from xfer) >= (select at from sale)::date then (select party from xfer)
    else (select party from sale)
  end;
$$;

comment on function public.machine_current_party(text, text) is
  'Who owns this machine NOW: the party from the later of its latest sale entry and its latest ownership transfer. A transfer dated the same day as a sale wins, since a machine cannot be transferred before it is sold.';

-- ---- 2. the upsert writes that party, not the sale's ----------------------
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
    coalesce(nullif(btrim(coalesce(i.sold_through, '')), ''), h.sold_through, ''),
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

-- ---- 3. a transfer re-decides the machine ---------------------------------
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
  -- the only thing that knows who owns it.
  update public.products p
     set party_name = public.machine_current_party(p.item_name, p.serial_number)
   where p.machine_key = lower(btrim(coalesce(m.item_name, ''))) || '|' || lower(btrim(coalesce(m.serial_number, '')))
     and not exists (select 1 from public.sale_items i
                      where lower(btrim(coalesce(i.product_name, ''))) = lower(btrim(coalesce(m.item_name, '')))
                        and lower(btrim(coalesce(i.serial_number, ''))) = lower(btrim(coalesce(m.serial_number, ''))));
  return null;
end $$;

drop trigger if exists zz_transfer_to_product on public.ownership_transfers;
create trigger zz_transfer_to_product
  after insert or update or delete on public.ownership_transfers
  for each row execute function public.transfer_to_product();

-- ---- 4. bring every machine that has a sale or a transfer up to date ------
do $$
declare r record; n bigint := 0;
begin
  for r in select i.id from public.sale_items i
            left join public.sale_entries h on h.sa_number = i.sa_number
           where btrim(coalesce(i.product_name, '')) <> ''
             and btrim(coalesce(i.serial_number, '')) <> ''
           order by coalesce(h.entry_at, i.created_at) nulls first, i.id loop
    perform public.upsert_product_from_sale(r.id);
    n := n + 1;
  end loop;

  update public.products p
     set party_name = public.machine_current_party(p.item_name, p.serial_number)
   where exists (select 1 from public.ownership_transfers t
                  where lower(btrim(coalesce(t.item_name, ''))) = lower(btrim(coalesce(p.item_name, '')))
                    and lower(btrim(coalesce(t.serial_number, ''))) = lower(btrim(coalesce(p.serial_number, ''))));

  raise notice '0238: % sale machine(s) re-derived; transferred machines follow their latest owner.', n;
end $$;
