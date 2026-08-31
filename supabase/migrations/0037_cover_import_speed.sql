-- ===========================================================================
-- Importing the cover registers has to finish inside a statement timeout.
--
-- Every sale / contract item syncs the machine it names (sync_product_cover),
-- which updates `products` by lower(trim(serial_number)) — an EXPRESSION, so
-- without a matching index each row seq-scanned the whole Product Master. At
-- ~21k machines that is ~5ms a row: a 1,000-row insert ran for seconds and
-- Supabase cancelled it ("canceling statement due to statement timeout").
--
-- With the index the same 17,321-row file lands in well under a second.
--
-- The two post-import functions are given their own statement_timeout as well:
-- they are single statements over every item row (~35k), and they are run by
-- `authenticated`, whose timeout is a few seconds.
-- ===========================================================================

create index if not exists products_serial_key_idx
  on public.products (lower(trim(serial_number)));

-- machine_cover pairs the two item tables by serial; keep both sides indexed
-- the same way (0036 created these — repeated here for a project that is
-- applying only this file).
create index if not exists sale_items_serial_idx     on public.sale_items (lower(trim(serial_number)));
create index if not exists contract_items_serial_idx on public.contract_items (lower(trim(serial_number)));

create or replace function public.refresh_product_cover()
returns integer language plpgsql security definer
set search_path = public set statement_timeout = '180s' as $$
declare n integer;
begin
  update public.products p set
    warranty_number = coalesce(m.sa_number, p.warranty_number),
    warranty_start  = coalesce(m.warranty_start, p.warranty_start),
    warranty_end    = coalesce(m.warranty_end,   p.warranty_end),
    contract_number = coalesce(m.mc_number, p.contract_number),
    contract_start  = coalesce(m.contract_start, p.contract_start),
    contract_end    = coalesce(m.contract_end,   p.contract_end),
    contract_type   = coalesce(nullif(m.contract_type, ''), p.contract_type),
    item_status     = m.item_status
  from public.machine_cover m
  where m.serial_key = lower(trim(p.serial_number));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.refresh_product_cover() to authenticated;

create or replace function public.cover_unpin_inherited()
returns integer language plpgsql security definer
set search_path = public set statement_timeout = '180s' as $$
declare n integer := 0; m integer;
begin
  update public.sale_items i set
    invoice_no      = case when i.invoice_no      is not distinct from h.invoice_no      then null else i.invoice_no end,
    invoice_date    = case when i.invoice_date    is not distinct from h.invoice_date    then null else i.invoice_date end,
    sold_through    = case when i.sold_through    is not distinct from h.sold_through    then null else i.sold_through end,
    warranty_start  = case when i.warranty_start  is not distinct from h.warranty_start  then null else i.warranty_start end,
    warranty_end    = case when i.warranty_end    is not distinct from h.warranty_end    then null else i.warranty_end end,
    warranty_years  = case when i.warranty_years  is not distinct from h.warranty_years  then null else i.warranty_years end,
    warranty_months = case when i.warranty_months is not distinct from h.warranty_months then null else i.warranty_months end,
    pm_visits       = case when i.pm_visits       is not distinct from h.pm_visits       then null else i.pm_visits end,
    warranty_status = case when i.warranty_status is not distinct from h.warranty_status then null else i.warranty_status end,
    other_details   = case when i.other_details   is not distinct from h.other_details   then null else i.other_details end,
    state           = case when i.state           is not distinct from h.state           then null else i.state end,
    city            = case when i.city            is not distinct from h.city            then null else i.city end,
    engineer        = case when i.engineer        is not distinct from h.engineer        then null else i.engineer end
  from public.sale_entries h where h.sa_number = i.sa_number;
  get diagnostics m = row_count; n := n + m;

  update public.contract_items i set
    entry_at         = case when i.entry_at         is not distinct from h.entry_at         then null else i.entry_at end,
    party_name       = case when i.party_name       is not distinct from h.party_name       then null else i.party_name end,
    payment_schedule = case when i.payment_schedule is not distinct from h.payment_schedule then null else i.payment_schedule end,
    bill_generate_at = case when i.bill_generate_at is not distinct from h.bill_generate_at then null else i.bill_generate_at end,
    contract_type    = case when i.contract_type    is not distinct from h.contract_type    then null else i.contract_type end,
    contract_start   = case when i.contract_start   is not distinct from h.contract_start   then null else i.contract_start end,
    contract_end     = case when i.contract_end     is not distinct from h.contract_end     then null else i.contract_end end,
    contract_years   = case when i.contract_years   is not distinct from h.contract_years   then null else i.contract_years end,
    contract_months  = case when i.contract_months  is not distinct from h.contract_months  then null else i.contract_months end,
    pm_visits_total  = case when i.pm_visits_total  is not distinct from h.pm_visits_total  then null else i.pm_visits_total end,
    status           = case when i.status           is not distinct from h.status           then null else i.status end
  from public.contract_entries h where h.mc_number = i.mc_number;
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;
grant execute on function public.cover_unpin_inherited() to authenticated;

analyze public.products;
