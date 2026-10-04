-- ===========================================================================
-- 0350 — THE MASTER DELETE GUARD COUNTS EVERY PLACE A PARTY OR A PART IS NAMED
--        (second re-review, 2026-10-03: D-137)
--
-- master_delete_guard (0325) refuses deleting a party or part that records
-- still name, but its lists left out:
--   * a party named as SOLD THROUGH -- on products, sale_entries, sale_items
--     and ownership_transfers (made dealer-only from the Party Master by 0328
--     the same day) -- as an Indoor DC's CONSIGNEE, an indoor job's DEMO FOR
--     party, a Field Failure Report's CUSTOMER and a material return's CUSTOMER;
--   * a part named on indoor_job_parts.part_code, which part_rename_impact()
--     and rename_part() both list.
-- Measured: a dealer named only as Sold Through, and a party named only as an
-- Indoor DC consignee, were each deleted (DELETE 1), and the machine went on
-- reading that Sold Through.
--
-- 0325's function VERBATIM with those columns added; a table or column a
-- project lacks is skipped exactly as before. It only ever REFUSES more
-- deletes -- nothing that could be deleted before and is still unnamed is
-- refused. In the rbac module (0325's), after 0347, before the policy tail.
-- ===========================================================================

create or replace function public.master_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  refs text[];
  r text; tbl text; col text; n bigint;
  key text;
  found text[] := '{}';
  total bigint := 0;
begin
  if tg_table_name = 'parties' then
    key := lower(btrim(old.party_name));
    refs := array['products.party_name', 'field_calls.party_name', 'installation_calls.party_name',
      'pm_calls.party_name', 'call_requests.party_name', 'pending_registrations.party_name',
      'sale_entries.party_name', 'contract_entries.party_name', 'contract_items.party_name',
      'ownership_transfers.from_party', 'ownership_transfers.to_party',
      'product_additional_entries.party_name', 'feedback.party_name', 'spare_requests.party_name',
      'spare_consumption_history.party_name', 'indoor_jobs.party_name',
      -- 0350 (D-137): the other places a party is named.
      'products.sold_through', 'sale_entries.sold_through', 'sale_items.sold_through',
      'ownership_transfers.sold_through', 'indoor_dcs.consignee', 'indoor_jobs.demo_for_party',
      'field_failure_reports.customer_name', 'material_returns.customer_name'];
  elsif tg_table_name = 'parts' then
    key := lower(btrim(old.item_detail));
    refs := array['spare_request_lines.part', 'spare_dispatch_lines.part', 'spare_consumption.part',
      'spare_consumption_history.part', 'spare_issue_history.part', 'handstock_opening.part',
      'handstock_adjustments.part', 'stock_transfer_lines.part', 'material_returns.part',
      -- 0350 (D-137): part_rename_impact() lists it, so the guard does too.
      'indoor_job_parts.part_code'];
  elsif tg_table_name = 'product_master' then
    key := lower(btrim(old.product_code));
    refs := array['products.item_code', 'sale_items.product_code', 'contract_items.product_code'];
  else
    return old;
  end if;
  if coalesce(key, '') = '' then return old; end if;

  foreach r in array refs loop
    tbl := split_part(r, '.', 1);
    col := split_part(r, '.', 2);
    if to_regclass('public.' || tbl) is null then continue; end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = tbl and column_name = col) then
      continue;
    end if;
    execute format('select count(*) from public.%I where lower(btrim(%I)) = $1', tbl, col) into n using key;
    if n > 0 then
      found := found || format('%s %s', n, case tbl when 'products' then 'machines' else replace(tbl, '_', ' ') end);
      total := total + n;
    end if;
  end loop;

  if total > 0 then
    raise exception '% is still named on % record(s) — %. It cannot be deleted while they name it.',
      case tg_table_name when 'parties' then 'This party'
                         when 'parts' then 'This part'
                         else 'This product line' end,
      total, array_to_string(found, ', ')
      using errcode = '23503';
  end if;
  return old;
end $$;
revoke execute on function public.master_delete_guard() from public, anon, authenticated;
