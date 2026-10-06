-- ===========================================================================
-- 0410 — THE COVER REGISTERS ARE IMAGED (second re-review D-055, FRS-187.3)
--
-- sale_entries, sale_items, contract_entries, contract_items,
-- ownership_transfers and product_additional_entries were outside 0225's
-- record_audit, so an edit to a machine's warranty or contract, a transfer
-- corrected, or an entry deleted with every machine under it left no image of
-- what was there. FRS-187.3: a correction shall be recorded with its before and
-- after values by a trigger that cannot be bypassed. The same statement-level
-- triggers as 0225 / 0314 / 0406, so a cover import is one event.
--
-- DELETION ITSELF STAYS -- the user's decision of 2026-10-06 ("Keep deleting,
-- recorded"): an entry, a machine, a transfer or an additional entry may still
-- be deleted by the holder of that register's delete authority, and what it
-- removed is read back from record_audit. FRS-187 was rewritten to match.
-- In data_integrity, after 0406: every cover table is created earlier in
-- ALL_ORDER.
-- ===========================================================================

do $on$
declare t text; n int := 0;
begin
  if to_regproc('public.record_audit_fn') is null then
    raise notice '0410: record_audit_fn() is missing -- run 0048_record_audit.sql first. Nothing armed.';
    return;
  end if;
  foreach t in array array[
    'sale_entries', 'sale_items', 'contract_entries', 'contract_items',
    'ownership_transfers', 'product_additional_entries'
  ] loop
    if to_regclass('public.' || t) is not null
       and (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'r' then
      execute format('drop trigger if exists record_audit_i on public.%I', t);
      execute format('drop trigger if exists record_audit_u on public.%I', t);
      execute format('drop trigger if exists record_audit_d on public.%I', t);
      execute format('create trigger record_audit_i after insert on public.%I '
                     'referencing new table as new_rows for each statement '
                     'execute function public.record_audit_fn()', t);
      execute format('create trigger record_audit_u after update on public.%I '
                     'referencing old table as old_rows new table as new_rows for each statement '
                     'execute function public.record_audit_fn()', t);
      execute format('create trigger record_audit_d after delete on public.%I '
                     'referencing old table as old_rows for each statement '
                     'execute function public.record_audit_fn()', t);
      n := n + 1;
    end if;
  end loop;
  raise notice '0410: record_audit armed on % of 6 cover tables.', n;
end $on$;
