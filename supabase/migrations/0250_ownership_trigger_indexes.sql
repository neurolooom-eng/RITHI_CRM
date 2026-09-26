-- ===========================================================================
-- THE OWNERSHIP TRIGGERS FIND A MACHINE BY AN INDEX, NOT A SCAN (finding 38).
--
--   machine_current_party() (0240) and transfer_to_product() (0238) run once
--   per row of every sale-line and ownership-transfer write, and look the
--   machine up by
--       lower(btrim(coalesce(<model>, ''))) and lower(btrim(coalesce(<serial>, '')))
--   The indexes that existed are on lower(btrim(serial_number)) (sale_items)
--   and lower(serial_number) (ownership_transfers). An expression index serves
--   only the expression it was built on, CHARACTER FOR CHARACTER, so neither
--   was used and every row of a batch scanned both registers. Measured by the
--   review at 20,000 sale lines and 4,000 transfers: a 500-row transfer upload
--   took 12.5 s against the 20 s statement limit, and 0.27 s with the trigger
--   off. It grows with both registers.
--
--   Two indexes whose expressions are the functions' own, column for column.
--   NEW NAMES, so `if not exists` guards nothing it should not: there is no
--   older index of these names with another definition to be silently kept.
--   Guarded by to_regclass so the file runs on a project without either table.
--   _status.sql row 192.
-- ===========================================================================

do $$
begin
  if to_regclass('public.sale_items') is not null then
    create index if not exists sale_items_machine_expr_idx on public.sale_items
      (lower(btrim(coalesce(product_name, ''))), lower(btrim(coalesce(serial_number, ''))));
  end if;
  if to_regclass('public.ownership_transfers') is not null then
    create index if not exists ownership_transfers_machine_expr_idx on public.ownership_transfers
      (lower(btrim(coalesce(item_name, ''))), lower(btrim(coalesce(serial_number, ''))));
  end if;
end $$;
