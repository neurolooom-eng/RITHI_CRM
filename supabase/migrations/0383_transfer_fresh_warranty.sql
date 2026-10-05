-- ===========================================================================
-- 0383 — A TRANSFER CAN GIVE THE NEW OWNER A FRESH WARRANTY
--
-- The user, 2026-10-05: "Need to be able to Update the Warranty Start Date,
-- Period, End Date, Same Logic as to Warranty Entry" -- "During Transfer, the
-- new Owner gets a Fresh warranty date." Asked: it is OPTIONAL per transfer,
-- and the Product Database's Warranty Number becomes the transfer's OT number
-- (its Reference no.).
--
-- ON THE TRANSFER, NOT ON THE SALE. The four columns below record what was
-- given and when; the original sale entry is not touched, so the Warranty
-- Register keeps saying what was sold.
--
-- THE SALE'S LOGIC (cover.ts): the start and the period in MONTHS are entered;
-- the years and the end are WORKED OUT, here as well as on the form, so a
-- value sent through the API cannot disagree with its own start and period.
-- The end is start + months - 1 day by cover_period_end()'s arithmetic (0218,
-- addPeriod()'s month overflow included), written inline because that
-- function's module runs after this one on a fresh build.
--
-- WHICH WARRANTY THE MACHINE WEARS (sync_product_machine, redefined from the
-- database's own current body -- 0330 + 0331 -- with only the fresh-warranty
-- lines added): the transfer's, when it starts on or after the one the sale or
-- the installation gives. A re-sale after the transfer starts later and takes
-- the warranty back; an old sale saved again starts earlier and does not.
-- ===========================================================================

alter table public.ownership_transfers add column if not exists warranty_start  date;
alter table public.ownership_transfers add column if not exists warranty_months numeric;
alter table public.ownership_transfers add column if not exists warranty_years  numeric;
alter table public.ownership_transfers add column if not exists warranty_end    date;

-- ---- the years and the end are worked out, never typed --------------------
create or replace function public.ownership_transfer_warranty()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.warranty_start is null then
    new.warranty_months := null; new.warranty_years := null; new.warranty_end := null;
    return new;
  end if;
  if new.warranty_months is null or new.warranty_months <= 0 then
    raise exception 'A fresh warranty needs its period in months (more than 0).';
  end if;
  -- The Warranty Number the machine will carry is this transfer's OT number.
  if btrim(coalesce(new.reference_no, '')) = '' then
    raise exception 'A fresh warranty needs the transfer''s Reference no. (its OT number) -- it becomes the machine''s Warranty Number.';
  end if;
  new.warranty_months := round(new.warranty_months);
  new.warranty_years  := round(new.warranty_months / 12.0, 2);
  new.warranty_end    := (date_trunc('month', new.warranty_start)::date
                          + make_interval(months => new.warranty_months::int)
                          + make_interval(days   => extract(day from new.warranty_start)::int - 1))::date - 1;
  return new;
end $$;
revoke execute on function public.ownership_transfer_warranty() from public, anon, authenticated;
drop trigger if exists ownership_transfer_warranty on public.ownership_transfers;
create trigger ownership_transfer_warranty before insert or update on public.ownership_transfers
  for each row execute function public.ownership_transfer_warranty();

-- ---- the machine wears it ---------------------------------------------------
create or replace function public.sync_product_machine(p_item text, p_serial text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n text := lower(btrim(coalesce(p_item, '')));
  s text := lower(btrim(coalesce(p_serial, '')));
  k text;
  w record; c record; a record; t record; cur record; pm record;
  v_party text;
  foreign_contract boolean := false;
  foreign_warranty boolean := false;
  v_inst date; v_months numeric; v_inst_end date;
  ft record; use_ft boolean := false;
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

  -- THE ENGINEER'S CHOICE AT INSTALLATION (0331, the user, 2026-10-03): where
  -- the installation's customer feedback answers "Warranty Start Date?" with
  -- "Installation Call Solved Date", the warranty starts on the day that call
  -- was solved and ends a warranty period later; "Invoice Date" keeps the
  -- documented start on the sale.
  v_inst := public.machine_install_warranty_start(p_item, p_serial);
  if v_inst is not null then
    select coalesce(i.warranty_months, h.warranty_months, i.warranty_years * 12, h.warranty_years * 12)
      into v_months
      from public.sale_items i left join public.sale_entries h on h.sa_number = i.sa_number
     where lower(btrim(coalesce(i.product_name, ''))) = n
       and lower(btrim(coalesce(i.serial_number, ''))) = s
     order by coalesce(i.warranty_end, h.warranty_end) desc nulls last, i.id desc limit 1;
    -- cover_period_end() (0218) reproduces the application's own arithmetic;
    -- asked by name because its module runs after this one on a fresh build.
    if v_months is not null and v_months > 0 and to_regprocedure('public.cover_period_end(date,numeric)') is not null then
      execute 'select public.cover_period_end($1, $2)' into v_inst_end using v_inst, v_months;
    end if;
  end if;

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

  -- A FRESH WARRANTY GIVEN ON A TRANSFER (0383, the user, 2026-10-05: "During
  -- Transfer, the new Owner gets a Fresh warranty date"): the latest transfer
  -- of this machine that carries one. It decides the machine's warranty when
  -- it starts on or after the warranty the sale (or the installation) gives,
  -- so a re-sale after the transfer takes the warranty back, and an old sale
  -- saved again does not.
  select x.reference_no as ref, x.warranty_start as ws, x.warranty_end as we,
         x.warranty_months as wm, x.warranty_years as wy
    into ft
    from public.ownership_transfers x
   where lower(btrim(coalesce(x.item_name, ''))) = n
     and lower(btrim(coalesce(x.serial_number, ''))) = s
     and x.warranty_start is not null
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

  use_ft := ft.ws is not null
    and ft.ws >= coalesce(case when v_inst is not null then v_inst end, w.ws, a.warranty_start, '-infinity'::date);

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
    warranty_number = case when use_ft then ft.ref
                           when foreign_warranty then ''
                           else coalesce(w.sa_number, nullif(a.warranty_number, ''), p.warranty_number) end,
    warranty_start  = case when use_ft then ft.ws
                           when v_inst is not null then v_inst
                           when foreign_warranty then null else coalesce(w.ws, a.warranty_start, p.warranty_start) end,
    warranty_end    = case when use_ft then ft.we
                           when v_inst is not null and v_inst_end is not null then v_inst_end
                           when foreign_warranty then null else coalesce(w.we, a.warranty_end,   p.warranty_end) end,
    invoice_no      = coalesce(w.inv,  p.invoice_no),
    invoice_date    = coalesce(w.invd, p.invoice_date),
    warranty_years  = case when use_ft then ft.wy else coalesce(w.wy,   p.warranty_years) end,
    warranty_months = case when use_ft then ft.wm::integer else coalesce(w.wm,   p.warranty_months) end,
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
      when case when use_ft then ft.we
                else coalesce(case when v_inst is not null then v_inst_end end, w.we, a.warranty_end) end >= current_date then 'WGP'
      when use_ft or w.sa_number is not null or c.mc_number is not null or a.warranty_number is not null
        or a.contract_number is not null or foreign_contract or foreign_warranty then 'OGP'
      else p.item_status end
  where p.machine_key = k;
end $function$;
revoke execute on function public.sync_product_machine(text, text) from public, anon, authenticated;

comment on column public.ownership_transfers.warranty_start is
  'A fresh warranty given to the new owner on this transfer (0383); blank keeps the machine''s warranty. Months entered; years and end worked out.';
