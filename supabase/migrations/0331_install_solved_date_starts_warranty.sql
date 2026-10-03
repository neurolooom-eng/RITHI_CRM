-- ===========================================================================
-- 0331 — THE WARRANTY STARTS WHERE THE INSTALLING ENGINEER SAYS (WGP)
--
-- The user, 2026-10-03: "when I install the product in the customer's place
-- and update the report there is a selection that I make as an engineer --
-- warranty start date should be from the documented date as per PO or in the
-- warranty sale entry or as per the installation solved date ... if the
-- engineer chooses the solved date as the warranty start date then the
-- warranty start date gets updated as the installation call solved date."
-- Product means product + serial. Asked: the end is RECOMPUTED from the
-- warranty period; the report's date box goes back to the selection; the 328
-- installations already answered are applied once, backed up.
--
-- THE SELECTION IS THE CUSTOMER FEEDBACK'S "Warranty Start Date?" -- measured
-- on the live project (_warranty_start_answers.sql, 2026-10-03): of 8,315
-- feedback records, 328 installations answer "Installation Call Solved Date",
-- 78 "Invoice Date", and 28 hold a date typed into the box RITHI had put in
-- its place (left as they are, the user's choice).
--
--   "Installation Call Solved Date" -> warranty start = the day the machine's
--       latest installation call was SOLVED (open_state Solved, its latest
--       visit), read in India time; end = cover_period_end(start, months),
--       months the sale's period (months, else years x 12) -- the same rule
--       and arithmetic the registers and Product Database 2.0 use.
--   "Invoice Date" (or anything else) -> the documented start on the PO /
--       Warranty Sale Entry stays, as 0330 writes it.
--
-- Whenever an installation's feedback is saved, or its call's solved state
-- changes, that machine is re-synced (sync_product_machine, now carrying this
-- rule). One-time: every machine whose installation answered "Installation
-- Call Solved Date" is re-synced, old start/end kept in
-- products_install_start_backup.
-- ===========================================================================

-- ---- the answer, for one machine ------------------------------------------
create or replace function public.machine_install_warranty_start(p_item text, p_serial text)
returns date language sql stable security definer set search_path = public as $$
  select case
           when lower(btrim(coalesce(f.answers ->> 'Warranty Start Date?', ''))) = 'installation call solved date'
            and c.open_state = 'Solved' and c.last_visit_at is not null
           then (c.last_visit_at at time zone 'Asia/Kolkata')::date
         end
    from public.installation_calls c
    left join public.feedback f on f.ucn = c.ucn
   where lower(btrim(coalesce(c.product_name, ''))) = lower(btrim(coalesce(p_item, '')))
     and lower(btrim(coalesce(c.serial, ''))) = lower(btrim(coalesce(p_serial, '')))
   order by c.last_visit_at desc nulls last, c.ucn desc
   limit 1;
$$;
revoke execute on function public.machine_install_warranty_start(text, text) from public, anon, authenticated;

-- ---- the one machine sync, now with the installation's answer --------------
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
  v_inst date; v_months numeric; v_inst_end date;
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
    warranty_start  = case when v_inst is not null then v_inst
                           when foreign_warranty then null else coalesce(w.ws, a.warranty_start, p.warranty_start) end,
    warranty_end    = case when v_inst is not null and v_inst_end is not null then v_inst_end
                           when foreign_warranty then null else coalesce(w.we, a.warranty_end,   p.warranty_end) end,
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
      when coalesce(case when v_inst is not null then v_inst_end end, w.we, a.warranty_end) >= current_date then 'WGP'
      when w.sa_number is not null or c.mc_number is not null or a.warranty_number is not null
        or a.contract_number is not null or foreign_contract or foreign_warranty then 'OGP'
      else p.item_status end
  where p.machine_key = k;
end $$;
revoke execute on function public.sync_product_machine(text, text) from public, anon, authenticated;

-- ---- when the answer or the solved state changes --------------------------
create or replace function public.install_start_to_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item text; v_serial text;
begin
  if tg_table_name = 'feedback' then
    if upper(coalesce(new.call_type, '')) not like 'INSTALL%' then return null; end if;
    select c.product_name, c.serial into v_item, v_serial
      from public.installation_calls c where c.ucn = new.ucn limit 1;
  else
    if tg_op = 'UPDATE' and (old.open_state, old.last_visit_at) is not distinct from (new.open_state, new.last_visit_at) then
      return null;
    end if;
    v_item := new.product_name; v_serial := new.serial;
  end if;
  if coalesce(btrim(v_item), '') <> '' and coalesce(btrim(v_serial), '') <> '' then
    perform public.sync_product_machine(v_item, v_serial);
  end if;
  return null;
end $$;
revoke execute on function public.install_start_to_product() from public, anon, authenticated;

drop trigger if exists zz_install_start_to_product on public.feedback;
create trigger zz_install_start_to_product after insert or update on public.feedback
  for each row execute function public.install_start_to_product();
drop trigger if exists zz_install_start_to_product on public.installation_calls;
create trigger zz_install_start_to_product after update on public.installation_calls
  for each row execute function public.install_start_to_product();

-- ---- once: the installations already answered ------------------------------
create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

create table if not exists public.products_install_start_backup (
  id          bigserial primary key,
  machine_key text not null,
  before      jsonb not null,
  saved_at    timestamptz not null default now()
);
alter table public.products_install_start_backup enable row level security;
revoke all on public.products_install_start_backup from anon, authenticated;
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.products_install_start_backup'::regclass);
  end if;
end $$;

do $$
declare n integer; r record;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0331_install_warranty_start') then
    raise notice '0331: installation warranty starts were applied before -- not touched again';
    return;
  end if;

  create temporary table t0331 on commit drop as
  select distinct p.machine_key, p.item_name, p.serial_number,
         jsonb_build_object('warranty_start', p.warranty_start, 'warranty_end', p.warranty_end,
                            'item_status', p.item_status) as before
    from public.feedback f
    join public.installation_calls c on c.ucn = f.ucn
    join public.products p
      on p.machine_key = lower(btrim(coalesce(c.product_name, ''))) || '|' || lower(btrim(coalesce(c.serial, '')))
   where lower(btrim(coalesce(f.answers ->> 'Warranty Start Date?', ''))) = 'installation call solved date';

  for r in select item_name, serial_number from t0331 loop
    perform public.sync_product_machine(r.item_name, r.serial_number);
  end loop;

  insert into public.products_install_start_backup (machine_key, before)
  select t.machine_key, t.before
    from t0331 t join public.products p on p.machine_key = t.machine_key
   where t.before is distinct from jsonb_build_object('warranty_start', p.warranty_start,
                                                      'warranty_end', p.warranty_end, 'item_status', p.item_status);
  get diagnostics n = row_count;

  insert into public.one_time_fixes_done (name, detail)
  values ('0331_install_warranty_start',
          format('%s of %s machine(s) given the installation solved date as warranty start', n, (select count(*) from t0331)));
  raise notice '0331: % of % machine(s) whose installation answered "Installation Call Solved Date" changed (old values in products_install_start_backup)',
    n, (select count(*) from t0331);
end $$;
