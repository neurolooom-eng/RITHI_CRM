-- ===========================================================================
-- 0361 — A MACHINE'S SOLD THROUGH IS CLEARED ONLY WHERE A TRANSFER SET IT, AND
--        A CORRECTED TRANSFER'S OLD MACHINE IS RE-READ TOO
--        (second re-review D-149; the user's decision, 2026-10-04)
--
-- On a machine with NO sale entry, transfer_to_product writes
--   sold_through = coalesce(machine_sold_through(...), p.sold_through)
-- reading "no dealer transfer left" as "keep what is there". Measured: a
-- dealer -> clinic transfer set Sold Through to the dealer; correcting the
-- From party left the machine on the dealer. And on an UPDATE only NEW's
-- machine was re-derived, so changing a transfer's serial left the old one.
--
-- THE USER'S DECISION: "Blank it only if a transfer set it" -- a Sold Through
-- that came from a Product Database upload (or an edit, or a sale) is left
-- alone. That needs to know WHERE the value came from, so:
--   * products.sold_through_from_transfer -- true when the transfer path
--     wrote the value; any other change of sold_through sets it false
--     (products_sold_through_source, a BEFORE UPDATE trigger that reads a
--     transaction-local ticket only transfer_resync_machine() raises);
--   * the transfer path, finding no dealer transfer left, blanks Sold Through
--     only where the flag is true; otherwise it keeps the value, as before;
--   * ONCE, existing machines whose Sold Through equals their current dealer
--     transfer's are marked as set by a transfer -- the only ones that provably
--     were. Everything else starts false, i.e. kept: an unknown origin is not
--     guessed to be a transfer.
--   * transfer_to_product re-reads OLD's machine as well when an UPDATE moves
--     a transfer to another machine.
--
-- transfer_to_product's body is the DATABASE'S definition (pg_get_functiondef
-- on a database built from every migration), moved into
-- transfer_resync_machine(item, serial) with the Sold Through line changed.
-- In the sales_contracts module, after 0329 / 0330.
-- ===========================================================================

alter table public.products add column if not exists sold_through_from_transfer boolean not null default false;
comment on column public.products.sold_through_from_transfer is
  'True when the Sold Through was written by an ownership transfer (0361); a transfer correction that leaves no dealer transfer blanks it only then.';

-- ---- 1. any other change of sold_through says it is not the transfer's --------
create or replace function public.products_sold_through_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sold_through is distinct from old.sold_through
     and coalesce(current_setting('rithi.sold_through_by_transfer', true), '') <> 'on' then
    new.sold_through_from_transfer := false;
  end if;
  return new;
end $$;
revoke execute on function public.products_sold_through_source() from public, anon, authenticated;
drop trigger if exists products_sold_through_source on public.products;
create trigger products_sold_through_source
  before update on public.products
  for each row execute function public.products_sold_through_source();

-- ---- 2. one machine, re-read from its sales and transfers -----------------------
create or replace function public.transfer_resync_machine(p_item text, p_serial text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_st text;
begin
  for r in select i.id from public.sale_items i
            where lower(btrim(coalesce(i.product_name, ''))) = lower(btrim(coalesce(p_item, '')))
              and lower(btrim(coalesce(i.serial_number, ''))) = lower(btrim(coalesce(p_serial, ''))) loop
    perform public.upsert_product_from_sale(r.id);
  end loop;

  -- A machine with NO sale entry still changes hands, and the transfer is then
  -- the only thing that knows who owns it -- and, since 0328, which dealer it
  -- came through; since 0329, it takes that owner's Party Master address, city,
  -- state and Service Engineer, a blank there keeping what the row has.
  -- Since 0361: with no dealer transfer left, Sold Through is blanked only if
  -- a transfer had set it; a value from anywhere else is kept.
  v_st := public.machine_sold_through(p_item, p_serial);
  perform set_config('rithi.sold_through_by_transfer', 'on', true);
  update public.products p
     set party_name       = c.party,
         sold_through     = case when v_st is not null then v_st
                                 when p.sold_through_from_transfer then ''
                                 else p.sold_through end,
         sold_through_from_transfer = (v_st is not null),
         address          = coalesce(nullif(btrim(pm.address), ''), p.address),
         city             = coalesce(nullif(btrim(pm.city), ''), p.city),
         state            = coalesce(nullif(btrim(pm.state), ''), p.state),
         service_engineer = coalesce(nullif(btrim(pm.service_engineer), ''), p.service_engineer)
    from (select public.machine_current_party(p_item, p_serial) as party) c
    left join public.parties pm on pm.name_key = lower(btrim(coalesce(c.party, '')))
   where p.machine_key = lower(btrim(coalesce(p_item, ''))) || '|' || lower(btrim(coalesce(p_serial, '')))
     and not exists (select 1 from public.sale_items i
                      where lower(btrim(coalesce(i.product_name, ''))) = lower(btrim(coalesce(p_item, '')))
                        and lower(btrim(coalesce(i.serial_number, ''))) = lower(btrim(coalesce(p_serial, ''))));
  perform set_config('rithi.sold_through_by_transfer', 'off', true);
  -- THE TRANSFER'S REF AND DATE (0330), and the rest of the machine.
  perform public.sync_product_machine(p_item, p_serial);
end $$;
revoke execute on function public.transfer_resync_machine(text, text) from public, anon, authenticated;

-- ---- 3. the trigger: NEW's machine, and OLD's when the transfer moved -----------
create or replace function public.transfer_to_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record;
begin
  m := case when tg_op = 'DELETE' then old else new end;
  perform public.transfer_resync_machine(m.item_name, m.serial_number);
  if tg_op = 'UPDATE'
     and (lower(btrim(coalesce(old.item_name, ''))) is distinct from lower(btrim(coalesce(new.item_name, '')))
          or lower(btrim(coalesce(old.serial_number, ''))) is distinct from lower(btrim(coalesce(new.serial_number, '')))) then
    perform public.transfer_resync_machine(old.item_name, old.serial_number);
  end if;
  return null;
end $$;
revoke execute on function public.transfer_to_product() from public, anon, authenticated;

-- ---- 4. once: the machines whose Sold Through a transfer provably set ----------
create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

do $$
declare n bigint;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0361_sold_through_from_transfer_marked') then return; end if;
  perform set_config('rithi.sold_through_by_transfer', 'on', true);
  update public.products p
     set sold_through_from_transfer = true
   where btrim(coalesce(p.sold_through, '')) <> ''
     and not exists (select 1 from public.sale_items i
                      where lower(btrim(coalesce(i.product_name, ''))) = lower(btrim(coalesce(p.item_name, '')))
                        and lower(btrim(coalesce(i.serial_number, ''))) = lower(btrim(coalesce(p.serial_number, ''))))
     and lower(btrim(p.sold_through)) = lower(btrim(coalesce(public.machine_sold_through(p.item_name, p.serial_number), '')));
  get diagnostics n = row_count;
  perform set_config('rithi.sold_through_by_transfer', 'off', true);
  insert into public.one_time_fixes_done (name, detail)
  values ('0361_sold_through_from_transfer_marked', n || ' machine(s) marked as having their Sold Through from a transfer');
  raise notice '0361: % machine(s) marked as having their Sold Through from a transfer', n;
end $$;
