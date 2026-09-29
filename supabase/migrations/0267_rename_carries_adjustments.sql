-- ===========================================================================
-- A USER MASTER RENAME CARRIES THE HAND STOCK ADJUSTMENTS TOO.
--
-- 0259 (finding 23) moves every record filed under a person's old name to the
-- new one when their User Master name is corrected -- calls, requests, spares,
-- consumption, hand stock. 0266 adds a table filed by engineer name,
-- `handstock_adjustments`; without joining that list, an engineer whose name
-- was corrected would keep their stock but lose their adjustments, and the
-- balance would split in two. The function below is 0259's VERBATIM with that
-- one table added to the list. The table's absence is tolerated exactly as
-- 0259 tolerates any other (to_regclass), so this can run before 0266.
-- ===========================================================================

create or replace function public.user_directory_carry_rename_records()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_key text := lower(btrim(coalesce(old.name, '')));
  new_nm  text := btrim(coalesce(new.name, ''));
  target  record;
begin
  if old_key = '' or new_nm = '' or old_key = lower(new_nm) then
    return null;
  end if;
  if exists (select 1 from public.user_directory d
              where d.id <> new.id and lower(btrim(d.name)) = old_key) then
    return null;
  end if;

  insert into public.engineer_rename_ticket (txid, old_key, new_name)
  values (txid_current(), old_key, new_nm)
  on conflict (txid) do update set old_key = excluded.old_key,
                                   new_name = excluded.new_name, at = now();

  for target in
    select * from (values
      ('field_calls', 'allocated_to'), ('installation_calls', 'allocated_to'), ('pm_calls', 'allocated_to'),
      ('call_requests', 'engineer'), ('pending_registrations', 'engineer'),
      ('spare_requests', 'engineer'), ('spare_dispatches', 'engineer'),
      ('spare_consumption', 'engineer'), ('spare_consumption_history', 'engineer'),
      ('handstock_opening', 'engineer'), ('spare_issue_history', 'engineer'),
      ('material_returns', 'engineer'), ('handstock_adjustments', 'engineer'),
      ('stock_transfers', 'from_engineer'), ('stock_transfers', 'to_engineer'),
      ('parties', 'service_engineer'), ('products', 'service_engineer')
    ) v(tbl, col)
  loop
    if to_regclass('public.' || target.tbl) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = target.tbl
                      and c.column_name = target.col) then
      execute format('update public.%I set %I = $1 where lower(btrim(%I)) = $2',
                     target.tbl, target.col, target.col)
        using new_nm, old_key;
    end if;
  end loop;

  delete from public.engineer_rename_ticket where txid = txid_current();
  return null;
end $$;
revoke execute on function public.user_directory_carry_rename_records() from public, anon, authenticated;
