-- ===========================================================================
-- The cover views read as their owner too, for the same reason.
--
-- `sale_entries` and `contract_entries` restrict reads to `masters.view`,
-- `cover.edit` or an administrator. `warranty_sale_details` and
-- `contract_details` are views over them that were never marked
-- `security_invoker`, so anybody signed in could read the sale and contract
-- record through the view that the table itself would have refused them.
--
-- Smaller in reach than the `calls` leak (0105) and exactly the same fault.
-- Filed in `sales_contracts` because that is the bundle defining these views.
-- ===========================================================================

do $$
declare v text;
begin
  foreach v in array array['warranty_sale_details', 'contract_details', 'machine_cover'] loop
    if to_regclass('public.' || v) is not null
       and (select relkind from pg_class where oid = ('public.' || v)::regclass) = 'v' then
      execute format('alter view public.%I set (security_invoker = on)', v);
      raise notice '%: row-level security now applies to the reader.', v;
    end if;
  end loop;
end $$;
