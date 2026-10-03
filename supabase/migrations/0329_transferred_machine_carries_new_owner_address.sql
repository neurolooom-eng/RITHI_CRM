-- ===========================================================================
-- 0329 — A TRANSFERRED MACHINE CARRIES ITS NEW OWNER'S ADDRESS (D-098)
--
-- The user, 2026-10-03: "Transferred machine should carry the new owner's
-- address."
--
-- upsert_product_from_sale() (0237, revised by 0238 and 0328) already gives a
-- transferred machine its NEW owner's NAME -- machine_current_party() -- but
-- went on writing the address, city, state and Service Engineer from the SALE,
-- i.e. the ORIGINAL buyer. Every re-save of a sale (and 0318's one-time update,
-- which re-saved all of them) therefore put the first buyer's address back on
-- a machine somebody else now holds. The transfer itself (transfer_to_product)
-- changed only the name.
--
-- Now, wherever the machine's current owner is NOT the sale's buyer, those four
-- come from the current owner's PARTY MASTER entry -- the same place a sale
-- entry takes its own address from (0318). A field the Party Master leaves
-- blank keeps what the machine row already has rather than being blanked: a
-- blank there says nothing is recorded, not that the machine has no address.
-- A machine still with its buyer is untouched by this file.
--
-- ONE-TIME REPAIR, with the BACKUP 0318 did not take: every machine currently
-- with a transferee is given that owner's Party Master address now. The four
-- old values of every row it changes are kept in
-- products_new_owner_address_backup (service role only). Guarded by
-- one_time_fixes_done, so a replayed bundle never repeats it.
--
-- Both functions are re-read from the database (0328's revisions) before being
-- replaced; only the address fields change.
-- ===========================================================================

create or replace function public.upsert_product_from_sale(p_item_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare i record; h record; v_party text; v_moved boolean;
        -- Plain variables, not a record: a record SELECTed into only when the
        -- machine moved is "not assigned yet" for every machine that did not,
        -- and the INSERT below names its fields either way.
        o_address text; o_city text; o_state text; o_engineer text;
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

  -- AND NOT THE BUYER'S ADDRESS EITHER (0329, D-098): a machine now with
  -- somebody else carries that owner's Party Master address, city, state and
  -- Service Engineer.
  v_moved := btrim(coalesce(v_party, '')) <> ''
         and lower(btrim(v_party)) is distinct from lower(btrim(coalesce(h.party_name, '')));
  if v_moved then
    select nullif(btrim(p.address), ''), nullif(btrim(p.city), ''),
           nullif(btrim(p.state), ''), nullif(btrim(p.service_engineer), '')
      into o_address, o_city, o_state, o_engineer
      from public.parties p where p.name_key = lower(btrim(v_party)) limit 1;
  end if;

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
    case when v_moved then coalesce(o_state, '')
         else coalesce(nullif(btrim(coalesce(i.state, '')), ''), h.state, '') end,
    case when v_moved then coalesce(o_city, '')
         else coalesce(nullif(btrim(coalesce(i.city,  '')), ''), h.city,  '') end,
    case when v_moved then coalesce(o_address, '')
         else coalesce(h.address, '') end,
    coalesce(nullif(btrim(coalesce(i.other_details, '')), ''), h.other_details, ''),
    case when v_moved then coalesce(o_engineer, '')
         else coalesce(nullif(btrim(coalesce(i.engineer, '')), ''), h.engineer, '') end)
  on conflict (machine_key) do update set
    party_name            = excluded.party_name,
    item_code             = excluded.item_code,
    warranty_number       = excluded.warranty_number,
    warranty_start        = excluded.warranty_start,
    warranty_end          = excluded.warranty_end,
    warranty_status_keyed = excluded.warranty_status_keyed,
    pm_visits             = excluded.pm_visits,
    sold_through          = excluded.sold_through,
    -- A transferee's blank Party Master field keeps what the row has.
    state                 = case when v_moved and excluded.state = '' then p.state else excluded.state end,
    city                  = case when v_moved and excluded.city = '' then p.city else excluded.city end,
    address               = case when v_moved and excluded.address = '' then p.address else excluded.address end,
    other_details         = excluded.other_details,
    service_engineer      = case when v_moved and excluded.service_engineer = '' then p.service_engineer
                                 else excluded.service_engineer end;
  -- `inst_call` IS NO LONGER WRITTEN HERE AT ALL, and that reverses yesterday's
  -- rule at the user's instruction: the installation call now BELONGS to the
  -- machine only while it names the current owner, which is decided on read.
  -- The stored column keeps whatever the import put there, as the keyed value.
end $$;
revoke execute on function public.upsert_product_from_sale(bigint) from public, anon, authenticated;

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
  -- came through; since 0329, it takes that owner's Party Master address, city,
  -- state and Service Engineer, a blank there keeping what the row has.
  update public.products p
     set party_name       = c.party,
         sold_through     = coalesce(public.machine_sold_through(p.item_name, p.serial_number), p.sold_through),
         address          = coalesce(nullif(btrim(pm.address), ''), p.address),
         city             = coalesce(nullif(btrim(pm.city), ''), p.city),
         state            = coalesce(nullif(btrim(pm.state), ''), p.state),
         service_engineer = coalesce(nullif(btrim(pm.service_engineer), ''), p.service_engineer)
    from (select public.machine_current_party(m.item_name, m.serial_number) as party) c
    left join public.parties pm on pm.name_key = lower(btrim(coalesce(c.party, '')))
   where p.machine_key = lower(btrim(coalesce(m.item_name, ''))) || '|' || lower(btrim(coalesce(m.serial_number, '')))
     and not exists (select 1 from public.sale_items i
                      where lower(btrim(coalesce(i.product_name, ''))) = lower(btrim(coalesce(m.item_name, '')))
                        and lower(btrim(coalesce(i.serial_number, ''))) = lower(btrim(coalesce(m.serial_number, ''))));
  return null;
end $$;

-- ---- the one-time repair, backed up first ---------------------------------
create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

create table if not exists public.products_new_owner_address_backup (
  id          bigserial primary key,
  machine_key text not null,
  party_name  text,
  before      jsonb not null,
  saved_at    timestamptz not null default now()
);
alter table public.products_new_owner_address_backup enable row level security;
revoke all on public.products_new_owner_address_backup from anon, authenticated;
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.products_new_owner_address_backup'::regclass);
  end if;
end $$;

do $$
declare n integer;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0329_new_owner_address') then
    raise notice '0329: transferred machines were given their new owner''s address before -- not touched again';
    return;
  end if;

  -- Every machine a transfer has moved, with the owner it has NOW and whether
  -- that owner is someone other than its buyer (or it has no sale at all).
  create temporary table t0329 on commit drop as
  select p.machine_key, pm.address, pm.city, pm.state, pm.service_engineer
    from (select distinct lower(btrim(coalesce(t.item_name, ''))) || '|' || lower(btrim(coalesce(t.serial_number, ''))) as k
            from public.ownership_transfers t
           where btrim(coalesce(t.to_party, '')) <> '') x
    join public.products p on p.machine_key = x.k
    join public.parties pm on pm.name_key = lower(btrim(coalesce(p.party_name, '')))
   where lower(btrim(coalesce(p.party_name, ''))) = lower(btrim(coalesce(public.machine_current_party(p.item_name, p.serial_number), '')))
     and not exists (
       select 1 from public.sale_items i join public.sale_entries e on e.sa_number = i.sa_number
        where lower(btrim(coalesce(i.product_name, ''))) || '|' || lower(btrim(coalesce(i.serial_number, ''))) = p.machine_key
          and lower(btrim(coalesce(e.party_name, ''))) = lower(btrim(coalesce(p.party_name, ''))));

  insert into public.products_new_owner_address_backup (machine_key, party_name, before)
  select p.machine_key, p.party_name,
         jsonb_build_object('address', p.address, 'city', p.city, 'state', p.state,
                            'service_engineer', p.service_engineer)
    from public.products p join t0329 t on t.machine_key = p.machine_key;

  update public.products p
     set address          = coalesce(nullif(btrim(t.address), ''), p.address),
         city             = coalesce(nullif(btrim(t.city), ''), p.city),
         state            = coalesce(nullif(btrim(t.state), ''), p.state),
         service_engineer = coalesce(nullif(btrim(t.service_engineer), ''), p.service_engineer)
    from t0329 t
   where p.machine_key = t.machine_key
     and (p.address, p.city, p.state, p.service_engineer) is distinct from
         (coalesce(nullif(btrim(t.address), ''), p.address), coalesce(nullif(btrim(t.city), ''), p.city),
          coalesce(nullif(btrim(t.state), ''), p.state),
          coalesce(nullif(btrim(t.service_engineer), ''), p.service_engineer));
  get diagnostics n = row_count;

  insert into public.one_time_fixes_done (name, detail)
  values ('0329_new_owner_address',
          format('%s transferred machine(s) given their new owner''s Party Master address', n));
  raise notice '0329: % transferred machine(s) given their new owner''s Party Master address (old values in products_new_owner_address_backup)', n;
end $$;
