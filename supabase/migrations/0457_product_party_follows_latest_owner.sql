-- ===========================================================================
-- 0457 -- THE PRODUCT DATABASE'S PARTY IS ALWAYS THE LATEST SALE ENTRY'S OR
-- OWNERSHIP TRANSFER'S, AND EVERY MACHINE IS RE-MAPPED ONCE (the user,
-- 2026-10-27, on VEGA | 31: "How is the Master Showing a Different Party when
-- all Sources are Pointing to another Party?", then "Change this Rule and Do a
-- 1 Time Mapping as per the Actual Logic. Sale Entry, Ownership Transfer which
-- ever is latest - Party Details should be used for this.").
--
-- WHAT WAS FOUND, on the live project (_trace_this_machine.sql): VEGA | 31 read
-- RAM MULTISPECIALITY HOSPITA,AHMEDABAD on the Master, with a Kanpur address,
-- while its sale entry SA8127, both contracts, its call history and Product
-- Database 2.0 all named LOTUS SUPER SPECIALITY HOSPITAL, KANPUR. No transfer.
-- machine_current_party() (0238/0240) answered LOTUS -- the rule was right and
-- the STORED value was never made to follow it, for two reasons:
--   1. NOTHING GUARDED products.party_name. A Product Database upload (or an
--      edit) writes whatever party its row carries -- the AppSheet import put
--      RAM MULTISPECIALITY there -- and nothing put it back.
--   2. sync_product_machine() (0330 -> 0391), which every register save and the
--      after-import refresh run, never sets the party of a machine that already
--      exists: it writes warranty, contract and status only. The party moved
--      only when a sale LINE was itself re-saved (upsert_product_from_sale) or a
--      transfer recorded (transfer_to_product). So SA8127's address reached the
--      row and its party did not.
--
-- THE RULE NOW, enforced where the value is stored: a BEFORE INSERT OR UPDATE
-- trigger on products. Whenever machine_current_party() names somebody -- the
-- party of whichever is latest, the sale entry or the ownership transfer --
-- that party is written, whatever the upload, the edit or any function sent.
-- An upload's party that disagrees is DISCARDED, not refused (the project's
-- rule for stamped values: refusing makes an honest 20,000-row import fail).
--   * Where the party CHANGES, the PARTY DETAILS move with it: the address,
--     city, state and Service Engineer of the owner -- the sale entry's own
--     (line first, then entry) when the owner is the sale's buyer, else the
--     new owner's Party Master entry, exactly as 0329 decides them. A blank
--     detail keeps what the row has: a blank says nothing is recorded, not
--     that the machine has no address.
--   * Where the party already agrees, nothing is touched -- a corrected
--     address uploaded for the right owner stands.
--   * A machine with NEITHER a sale entry NOR a transfer is left alone, as
--     0238 decided: the import is the only record of who owns it.
-- It fires on every UPDATE, not only of party_name, so sync_product_machine()'s
-- writes now carry the party too, with no rewrite of that function.
--
-- THE ONE-TIME MAPPING: every machine whose stored party is not the rule's is
-- re-written through the same trigger, with its old party and details kept in
-- products_party_remap_backup (service role only) and which event decided it.
-- Guarded by one_time_fixes_done, so a replayed bundle never repeats it.
-- Product Database 2.0 is untouched (it keeps CW-012's wider evidence).
-- ===========================================================================

-- ---- 1. who owns the machine now, and with what details ---------------------
create or replace function public.machine_owner_details(p_item_name text, p_serial text)
returns table (party text, address text, city text, state text, engineer text, decided_by text)
language plpgsql stable set search_path = public as $$
declare
  n text := lower(btrim(coalesce(p_item_name, '')));
  s text := lower(btrim(coalesce(p_serial, '')));
  v_party text;
  -- Plain variables, not records: a record never selected into is "not
  -- assigned yet" and reading it errors (0329's lesson).
  v_sa text; v_buyer text; v_addr text; v_city text; v_state text; v_eng text;
  v_ref text; v_tdate date;
begin
  v_party := btrim(coalesce(public.machine_current_party(p_item_name, p_serial), ''));
  if v_party = '' then return; end if;

  -- The latest sale line, picked exactly as machine_current_party() picks it.
  select x.sa_number, coalesce(e.party_name, ''), coalesce(e.address, ''),
         coalesce(nullif(btrim(coalesce(x.city, '')), ''), e.city, ''),
         coalesce(nullif(btrim(coalesce(x.state, '')), ''), e.state, ''),
         coalesce(nullif(btrim(coalesce(x.engineer, '')), ''), e.engineer, '')
    into v_sa, v_buyer, v_addr, v_city, v_state, v_eng
    from public.sale_items x
    left join public.sale_entries e on e.sa_number = x.sa_number
   where lower(btrim(coalesce(x.product_name, ''))) = n and lower(btrim(coalesce(x.serial_number, ''))) = s
   order by coalesce(e.entry_at, x.created_at) desc nulls last, x.id desc limit 1;

  if v_sa is not null and lower(v_party) = lower(btrim(v_buyer)) then
    -- STILL WITH THE SALE'S BUYER: the sale entry's own details (0329).
    return query select v_party, v_addr, v_city, v_state, v_eng, 'Sale entry ' || v_sa;
    return;
  end if;

  -- WITH A TRANSFEREE: that owner's Party Master entry (0329).
  select x.reference_no, x.transfer_date into v_ref, v_tdate from public.ownership_transfers x
   where lower(btrim(coalesce(x.item_name, ''))) = n and lower(btrim(coalesce(x.serial_number, ''))) = s
     and btrim(coalesce(x.to_party, '')) <> ''
   order by coalesce(x.transferred_at, x.created_at, x.transfer_date::timestamptz) desc nulls last, x.id desc limit 1;
  return query
    select v_party,
           coalesce(nullif(btrim(pm.address), ''), ''), coalesce(nullif(btrim(pm.city), ''), ''),
           coalesce(nullif(btrim(pm.state), ''), ''), coalesce(nullif(btrim(pm.service_engineer), ''), ''),
           'Ownership transfer ' || coalesce(nullif(btrim(coalesce(v_ref, '')), ''), to_char(v_tdate, 'DD-Mon-YYYY'), '')
      from (select 1) one
      left join lateral (select * from public.parties x where x.name_key = lower(v_party) limit 1) pm on true;
end $$;
revoke execute on function public.machine_owner_details(text, text) from public, anon, authenticated;

-- ---- 2. the rule, where the value is stored --------------------------------
create or replace function public.products_party_follows_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.machine_owner_details(new.item_name, new.serial_number);
  if o.party is null or btrim(o.party) = '' then return new; end if;   -- no sale, no transfer: left alone
  if lower(btrim(coalesce(new.party_name, ''))) is distinct from lower(btrim(o.party)) then
    new.address          := coalesce(nullif(btrim(o.address), ''), new.address);
    new.city             := coalesce(nullif(btrim(o.city), ''), new.city);
    new.state            := coalesce(nullif(btrim(o.state), ''), new.state);
    new.service_engineer := coalesce(nullif(btrim(o.engineer), ''), new.service_engineer);
  end if;
  new.party_name := o.party;   -- the event's own spelling
  return new;
end $$;
revoke execute on function public.products_party_follows_owner() from public, anon, authenticated;

-- "zz_": after the other BEFORE triggers on products, before zzz_sys_stamp.
drop trigger if exists zz_products_party_follows_owner on public.products;
create trigger zz_products_party_follows_owner before insert or update on public.products
  for each row execute function public.products_party_follows_owner();

-- ---- 3. the one-time mapping, backed up first -------------------------------
create table if not exists public.products_party_remap_backup (
  id            bigint generated always as identity primary key,
  machine_key   text not null,
  old_party     text,
  old_address   text,
  old_city      text,
  old_state     text,
  old_engineer  text,
  new_party     text,
  decided_by    text,
  saved_at      timestamptz not null default now()
);
alter table public.products_party_remap_backup enable row level security;   -- no policy: service role only
-- The five system columns every table carries (0244), attached here because
-- sys_columns.sql has already run on a live project.
do $$ begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.products_party_remap_backup'::regclass);
  end if;
end $$;

do $$
declare n integer;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0457_product_party_follows_latest_owner') then
    return;
  end if;

  insert into public.products_party_remap_backup
    (machine_key, old_party, old_address, old_city, old_state, old_engineer, new_party, decided_by)
  select p.machine_key, p.party_name, p.address, p.city, p.state, p.service_engineer, o.party, o.decided_by
    from public.products p
   cross join lateral public.machine_owner_details(p.item_name, p.serial_number) o
   where btrim(coalesce(o.party, '')) <> ''
     and p.party_name is distinct from o.party;
  get diagnostics n = row_count;

  -- Through the trigger: it writes the party and, where it changed, the details.
  update public.products p set party_name = p.party_name
    from public.products_party_remap_backup b
   where b.machine_key = p.machine_key
     and b.saved_at = now();   -- this run's rows: now() is the transaction's start

  insert into public.one_time_fixes_done (name, detail)
  values ('0457_product_party_follows_latest_owner',
          n || ' machine(s) re-mapped to the party of their latest sale entry or ownership transfer; old values in products_party_remap_backup');
  raise notice '0457: % machine(s) re-mapped to the party of their latest sale entry or ownership transfer', n;
end $$;
