-- ===========================================================================
-- 0469 -- A USER MASTER RENAME CARRIES THE HAND STOCK COUNTS (0468).
--
-- user_directory_carry_rename_records() moves every record that names an
-- engineer to the new name (0259, 0267, 0346). Hand stock reconciliations
-- (0468) name the engineer and key the balance on it, so a rename that left
-- them behind would split the line in two: the count under the old name, the
-- movements since under the new one. The body is 0346's, read out of a
-- database built from every migration; ONE pair added. The loop already skips
-- a table that does not exist, so this module may run before the hand stock
-- module creates it.
-- ===========================================================================

create or replace function public.user_directory_carry_rename_records()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      ('handstock_reconciliations', 'engineer'),  -- NEW (0469)
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

  -- An Indoor DC still WAITING for its authoriser follows the rename (D-144):
  -- the approver finds the DC by this name, so without it the DC stays Pending
  -- approval with its units held and nobody able to reach it. A DC already
  -- approved, rejected or issued before approval keeps the name it was printed
  -- with -- who authorised a document is history, as dispatched_by is (0259).
  if to_regclass('public.indoor_dcs') is not null then
    update public.indoor_dcs set authorised_by_name = new_nm
     where lower(btrim(authorised_by_name)) = old_key
       and approval_status = 'Pending approval';
  end if;

  delete from public.engineer_rename_ticket where txid = txid_current();
  return null;
end $function$;
