-- ===========================================================================
-- 0330 — THE THREE REGISTERS FILL THE PRODUCT DATABASE, BY PRODUCT + SERIAL
--
-- The user, 2026-10-03:
--   "Whenever I add a new sale entry, Insert the Product+SerialNo into the
--    product database. And map the Warranty Sale number, start date, end date,
--    pm visit - basically all relevant fields in product database.
--    When I add a contract entry, it should update the product database for
--    that product+serial number - Contract No, Contract start date, contract
--    end date, Contract Type, PM Visits.. basically all contract details.
--    During ownership transfer, the product+serial no should get updated --
--    all those details as per details in ownership transfer."
-- and, asked: a contract's PM visits OVERWRITE the machine's PM Visits; the
-- transfer's Ref (OT No.) and Date are carried; the sale's Invoice No., Invoice
-- Date, Warranty Years / Months and Accessories Included get columns; a
-- contract for a machine the Product Database does not hold INSERTS it.
--
-- WHAT WAS WRONG. The sale already inserted its machines (0237). The CONTRACT
-- reached products only through sync_product_cover(serial) (0036): by SERIAL
-- ALONE, so two models sharing a serial wore each other's contract (the
-- ORION-G 2410 / CPX CARE MC5521 case of 2026-09-14); it carried no PM visits
-- and no status, and it never inserted a machine.
--
-- NOW one function, sync_product_machine(product, serial), does the lot for
-- ONE machine, keyed exactly as products is (machine_key), and every path
-- calls it: a sale line or entry, a contract line or entry, a transfer, an
-- additional entry, and the after-import refresh.
--   * Sale  -> Warranty No., start, end, PM visits, Invoice No./Date, Warranty
--              Years/Months, Accessories Included -- from the machine's LATEST
--              sale line (by warranty end), each field the line's own or else
--              its entry's.
--   * Contract -> Contract No., start, end, type, status and PM visits (which
--              then OVERWRITE the sale's) -- from the machine's LATEST contract
--              line (by contract end), line first, then entry.
--   * Transfer -> Transfer Ref and Transfer Date of the latest transfer; the
--              owner, Sold Through and address stay with 0238/0328/0329.
--   * Additional entry -> still only where the registers are silent.
-- A contract number the machine carries that belongs to ANOTHER model sharing
-- its serial -- what the serial-only sync wrote -- is cleared, with its dates
-- and type, and likewise a warranty number from another model's sale. A value
-- with no register line at all (an imported one) is left as it is.
--
-- ONE-TIME RE-SYNC of every machine, with every changed row's old values kept
-- in products_resync_backup (service role only); guarded by
-- one_time_fixes_done so a replayed bundle never repeats it.
-- ===========================================================================

-- ---- 1. the columns the user asked for ------------------------------------
alter table public.products add column if not exists invoice_no           text;
alter table public.products add column if not exists invoice_date         date;
alter table public.products add column if not exists warranty_years       numeric;
alter table public.products add column if not exists warranty_months      integer;
alter table public.products add column if not exists accessories_included boolean;
alter table public.products add column if not exists transfer_ref         text;
alter table public.products add column if not exists transfer_date        date;

-- The contract lines are now looked up by machine, as the sale lines (0252).
create index if not exists contract_items_machine_expr_idx on public.contract_items
  (lower(btrim(coalesce(product_name, ''))), lower(btrim(coalesce(serial_number, ''))));

-- ---- 2. one machine, every register ---------------------------------------
create or replace function public.sync_product_machine(p_item text, p_serial text)
returns void language plpgsql security definer set search_path = public as $$
declare
  n text := lower(btrim(coalesce(p_item, '')));
  s text := lower(btrim(coalesce(p_serial, '')));
  k text;
  w record; c record; a record; t record; cur record; pm record;
  v_party text;
  foreign_contract boolean := false;
  foreign_warranty boolean := false;
begin
  if n = '' or s = '' then return; end if;
  k := n || '|' || s;

  select i.sa_number,
         coalesce(i.warranty_start, h.warranty_start) as ws,
         coalesce(i.warranty_end,   h.warranty_end)   as we,
         coalesce(i.pm_visits,      h.pm_visits)      as pm,
         coalesce(nullif(btrim(coalesce(i.invoice_no, '')), ''), nullif(btrim(coalesce(h.invoice_no, '')), '')) as inv,
         coalesce(i.invoice_date,    h.invoice_date)    as invd,
         coalesce(i.warranty_years,  h.warranty_years)  as wy,
         coalesce(i.warranty_months, h.warranty_months) as wm,
         i.accessories_included as acc
    into w
    from public.sale_items i left join public.sale_entries h on h.sa_number = i.sa_number
   where lower(btrim(coalesce(i.product_name, ''))) = n
     and lower(btrim(coalesce(i.serial_number, ''))) = s
   order by coalesce(i.warranty_end, h.warranty_end) desc nulls last, i.id desc limit 1;

  select i.mc_number, i.product_code,
         coalesce(nullif(btrim(coalesce(i.contract_type, '')), ''), h.contract_type) as ct,
         coalesce(i.contract_start, h.contract_start) as cs,
         coalesce(i.contract_end,   h.contract_end)   as ce,
         coalesce(i.pm_visits_total, h.pm_visits_total) as pm,
         coalesce(nullif(btrim(coalesce(i.status, '')), ''), h.status) as st,
         coalesce(nullif(btrim(coalesce(i.party_name, '')), ''), h.party_name) as party
    into c
    from public.contract_items i left join public.contract_entries h on h.mc_number = i.mc_number
   where lower(btrim(coalesce(i.product_name, ''))) = n
     and lower(btrim(coalesce(i.serial_number, ''))) = s
   order by coalesce(i.contract_end, h.contract_end) desc nulls last, i.id desc limit 1;

  -- The recovered detail, used only where the registers are silent.
  select e.warranty_number, e.warranty_start, e.warranty_end,
         e.contract_number, e.contract_type, e.contract_start, e.contract_end
    into a
    from public.product_additional_entries e where e.machine_key = k limit 1;

  select x.reference_no as ref, x.transfer_date as d
    into t
    from public.ownership_transfers x
   where lower(btrim(coalesce(x.item_name, ''))) = n
     and lower(btrim(coalesce(x.serial_number, ''))) = s
   order by coalesce(x.transferred_at, x.created_at, x.transfer_date::timestamptz) desc nulls last, x.id desc
   limit 1;

  -- A CONTRACT FOR A MACHINE NOT YET HELD is inserted (the user's choice), for
  -- the owner the registers name, with that owner's Party Master address.
  if c.mc_number is not null and not exists (select 1 from public.products where machine_key = k) then
    v_party := coalesce(nullif(btrim(coalesce(public.machine_current_party(p_item, p_serial), '')), ''),
                        nullif(btrim(coalesce(c.party, '')), ''), '');
    select nullif(btrim(x.address), '') as address, nullif(btrim(x.city), '') as city,
           nullif(btrim(x.state), '') as state, nullif(btrim(x.service_engineer), '') as engineer
      into pm from public.parties x where x.name_key = lower(v_party) limit 1;
    insert into public.products (item_name, serial_number, party_name, item_code,
                                 address, city, state, service_engineer)
    values (btrim(p_item), btrim(p_serial), v_party, coalesce(c.product_code, ''),
            coalesce(pm.address, ''), coalesce(pm.city, ''), coalesce(pm.state, ''), coalesce(pm.engineer, ''))
    on conflict (machine_key) do nothing;
  end if;

  select p.contract_number, p.warranty_number into cur from public.products p where p.machine_key = k;
  if not found then return; end if;

  -- WHAT THE SERIAL-ONLY SYNC LEFT BEHIND: a number this machine carries that a
  -- register line DOES hold, but for another model sharing the serial.
  if c.mc_number is null and nullif(btrim(coalesce(a.contract_number, '')), '') is null
     and btrim(coalesce(cur.contract_number, '')) <> '' then
    foreign_contract := exists (select 1 from public.contract_items x where x.mc_number = cur.contract_number);
  end if;
  if w.sa_number is null and nullif(btrim(coalesce(a.warranty_number, '')), '') is null
     and btrim(coalesce(cur.warranty_number, '')) <> '' then
    foreign_warranty := exists (select 1 from public.sale_items x where x.sa_number = cur.warranty_number);
  end if;

  update public.products p set
    warranty_number = case when foreign_warranty then ''
                           else coalesce(w.sa_number, nullif(a.warranty_number, ''), p.warranty_number) end,
    warranty_start  = case when foreign_warranty then null else coalesce(w.ws, a.warranty_start, p.warranty_start) end,
    warranty_end    = case when foreign_warranty then null else coalesce(w.we, a.warranty_end,   p.warranty_end) end,
    invoice_no      = coalesce(w.inv,  p.invoice_no),
    invoice_date    = coalesce(w.invd, p.invoice_date),
    warranty_years  = coalesce(w.wy,   p.warranty_years),
    warranty_months = coalesce(w.wm,   p.warranty_months),
    accessories_included = coalesce(w.acc, p.accessories_included),
    contract_number = case when foreign_contract then ''
                           else coalesce(c.mc_number, nullif(a.contract_number, ''), p.contract_number) end,
    contract_start  = case when foreign_contract then null else coalesce(c.cs, a.contract_start, p.contract_start) end,
    contract_end    = case when foreign_contract then null else coalesce(c.ce, a.contract_end,   p.contract_end) end,
    contract_type   = case when foreign_contract then ''
                           else coalesce(nullif(c.ct, ''), nullif(a.contract_type, ''), p.contract_type) end,
    contract_status_keyed = case when foreign_contract then ''
                                 else coalesce(nullif(btrim(coalesce(c.st, '')), ''), p.contract_status_keyed) end,
    -- THE CONTRACT'S PM VISITS OVERWRITE THE SALE'S (the user's choice), while
    -- the machine has a contract line saying how many.
    pm_visits       = case when c.mc_number is not null and c.pm is not null then c.pm
                           else coalesce(w.pm, p.pm_visits) end,
    transfer_ref    = coalesce(nullif(btrim(coalesce(t.ref, '')), ''), p.transfer_ref),
    transfer_date   = coalesce(t.d, p.transfer_date),
    -- machine_cover's rule (0036): a current contract is its type, a current
    -- warranty WGP, and a machine the registers know with neither is OGP. One
    -- no register mentions keeps the status it was imported with.
    item_status     = case
      when coalesce(c.ce, a.contract_end) >= current_date
        then coalesce(nullif(c.ct, ''), nullif(a.contract_type, ''), 'CMC')
      when coalesce(w.we, a.warranty_end) >= current_date then 'WGP'
      when w.sa_number is not null or c.mc_number is not null or a.warranty_number is not null
        or a.contract_number is not null or foreign_contract or foreign_warranty then 'OGP'
      else p.item_status end
  where p.machine_key = k;
end $$;
revoke execute on function public.sync_product_machine(text, text) from public, anon, authenticated;

-- ---- 3. every path goes through it ----------------------------------------
-- The serial-only entry point stays for anything that still calls it, and now
-- syncs each machine bearing that serial on its OWN registers.
create or replace function public.sync_product_cover(p_serial text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select p.item_name, p.serial_number from public.products p
            where lower(btrim(p.serial_number)) = lower(btrim(coalesce(p_serial, ''))) loop
    perform public.sync_product_machine(r.item_name, r.serial_number);
  end loop;
end $$;

create or replace function public.cover_item_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    perform public.sync_product_machine(new.product_name, new.serial_number);
  end if;
  if tg_op = 'DELETE' or (old.product_name, old.serial_number) is distinct from (new.product_name, new.serial_number) then
    perform public.sync_product_machine(old.product_name, old.serial_number);
  end if;
  return null;
end $$;

create or replace function public.cover_header_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_table_name = 'sale_entries' then
    for r in select product_name, serial_number from public.sale_items where sa_number = new.sa_number loop
      perform public.sync_product_machine(r.product_name, r.serial_number);
    end loop;
  else
    for r in select product_name, serial_number from public.contract_items where mc_number = new.mc_number loop
      perform public.sync_product_machine(r.product_name, r.serial_number);
    end loop;
  end if;
  return null;
end $$;

create or replace function public.product_additional_entry_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_product_machine(new.item_name, new.serial_number);
  return null;
end $$;

-- The sale's own write (0329) ends by re-syncing the machine, so a contract's
-- PM visits are not overwritten by the sale that runs after it.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.upsert_product_from_sale(bigint)'::regprocedure);
  if position('sync_product_machine' in src) = 0 then
    src := replace(src,
      E'  -- `inst_call` IS NO LONGER WRITTEN HERE AT ALL',
      E'  -- THE REST OF THE MACHINE -- invoice, years/months, accessories, and the\n'
      || E'  -- contract that may overwrite PM visits -- from every register (0330).\n'
      || E'  perform public.sync_product_machine(i.product_name, i.serial_number);\n'
      || E'  -- `inst_call` IS NO LONGER WRITTEN HERE AT ALL');
    if position('sync_product_machine' in src) = 0 then
      raise exception '0330: upsert_product_from_sale() is not the shape this file expects -- read it from the database and edit by hand';
    end if;
    execute src;
  end if;
end $$;

-- A transfer ends the same way, which carries its Ref and Date.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.transfer_to_product()'::regprocedure);
  if position('sync_product_machine' in src) = 0 then
    src := replace(src,
      E'  return null;\nend',
      E'  -- THE TRANSFER''S REF AND DATE (0330), and the rest of the machine.\n'
      || E'  perform public.sync_product_machine(m.item_name, m.serial_number);\n'
      || E'  return null;\nend');
    if position('sync_product_machine' in src) = 0 then
      raise exception '0330: transfer_to_product() is not the shape this file expects -- read it from the database and edit by hand';
    end if;
    execute src;
  end if;
end $$;

-- THE OLDEST TRANSFER RULE MOVED EVERY MACHINE SHARING THE SERIAL (0072,
-- D-060): transferring ORION 219 also handed the ANAVENT 219 to the new owner.
-- The user's rule is product + serial, so it now moves the ONE machine, to
-- whoever the latest dated evidence names (machine_current_party, 0238).
create or replace function public.ownership_transfer_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.products p
     set party_name = public.machine_current_party(p.item_name, p.serial_number)
   where p.machine_key = lower(btrim(coalesce(new.item_name, ''))) || '|' || lower(btrim(coalesce(new.serial_number, '')))
     and coalesce(public.machine_current_party(p.item_name, p.serial_number), '') <> ''
     and p.party_name is distinct from public.machine_current_party(p.item_name, p.serial_number);
  return null;
end $$;

-- The after-import refresh: every machine held, and every contract line for a
-- machine not yet held, each on its own registers.
create or replace function public.refresh_product_cover()
returns integer language plpgsql security definer set search_path = public
set statement_timeout to '600s' as $$
declare n integer := 0; r record;
begin
  -- 0247: THE COVER ADMIN ACTION IS FOR WHOEVER MAY EDIT COVER. This runs with
  -- the owner's rights over every sale, contract and machine, so it checks the
  -- caller itself. A call with nobody signed in (the SQL editor, a scheduled
  -- job) passes;
  -- the not-signed-in role cannot call it at all (0248 withdraws it).
  if auth.uid() is not null and not (public.is_admin() or public.has_perm('cover.edit.entries') or public.has_perm('contract.edit.entries')) then
    raise exception 'Only someone who may edit cover (cover.edit) can re-fold cover after an import.';
  end if;
  for r in
    select item_name as a, serial_number as b from public.products
    union
    select product_name, serial_number from public.contract_items
     where btrim(coalesce(product_name, '')) <> '' and btrim(coalesce(serial_number, '')) <> ''
  loop
    perform public.sync_product_machine(r.a, r.b);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---- 4. once: every machine re-synced, old values kept ---------------------
create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

create table if not exists public.products_resync_backup (
  id          bigserial primary key,
  machine_key text not null,
  before      jsonb not null,
  saved_at    timestamptz not null default now()
);
alter table public.products_resync_backup enable row level security;
revoke all on public.products_resync_backup from anon, authenticated;
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.products_resync_backup'::regclass);
  end if;
end $$;

do $$
declare n_before integer; n_changed integer; n_added integer; r record;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0330_product_database_resync') then
    raise notice '0330: the Product Database was re-synced from the registers before -- not touched again';
    return;
  end if;
  select count(*) into n_before from public.products;

  create temporary table b0330 on commit drop as
  select p.machine_key, jsonb_build_object(
           'warranty_number', p.warranty_number, 'warranty_start', p.warranty_start, 'warranty_end', p.warranty_end,
           'contract_number', p.contract_number, 'contract_start', p.contract_start, 'contract_end', p.contract_end,
           'contract_type', p.contract_type, 'contract_status_keyed', p.contract_status_keyed,
           'pm_visits', p.pm_visits, 'item_status', p.item_status) as before
    from public.products p;

  for r in
    select item_name as a, serial_number as b from public.products
    union
    select product_name, serial_number from public.contract_items
     where btrim(coalesce(product_name, '')) <> '' and btrim(coalesce(serial_number, '')) <> ''
  loop
    perform public.sync_product_machine(r.a, r.b);
  end loop;

  insert into public.products_resync_backup (machine_key, before)
  select b.machine_key, b.before
    from b0330 b join public.products p on p.machine_key = b.machine_key
   where b.before is distinct from jsonb_build_object(
           'warranty_number', p.warranty_number, 'warranty_start', p.warranty_start, 'warranty_end', p.warranty_end,
           'contract_number', p.contract_number, 'contract_start', p.contract_start, 'contract_end', p.contract_end,
           'contract_type', p.contract_type, 'contract_status_keyed', p.contract_status_keyed,
           'pm_visits', p.pm_visits, 'item_status', p.item_status);
  get diagnostics n_changed = row_count;
  select count(*) - n_before into n_added from public.products;

  insert into public.one_time_fixes_done (name, detail)
  values ('0330_product_database_resync',
          format('%s machine(s) changed, %s added from contracts', n_changed, n_added));
  raise notice '0330: % machine(s) changed (old values in products_resync_backup), % added from contract lines', n_changed, n_added;
end $$;
