-- ===========================================================================
-- 0346 — A USER MASTER RENAME CARRIES THE INDOOR DCs WAITING FOR THAT PERSON
--        (second re-review, 2026-10-03: D-144)
--
-- user_directory_carry_rename_records() (0259, 0267) moves every record filed
-- under a person's old name to the new one. indoor_dcs.authorised_by_name was
-- not on its list, and it is how an Indoor DC finds its approver (0327:
-- indoor_dc_may_approve, the read policy and approve_indoor_dc all match it).
-- Measured: after the authoriser was renamed they saw 0 DCs and could not reach
-- the one naming them, which stayed Pending approval with its units held.
--
-- ONLY A PENDING DC MOVES. On an approved, rejected or "issued before
-- approval" DC the name is what the printed document says authorised it, and
-- re-printing it must say the same thing.
--
-- The function below is 0267's VERBATIM with that one statement added, read
-- from a database built from every migration. Same module (user_directory),
-- after 0267, so a replay of user_directory.sql ends on this definition.
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
end $$;
revoke execute on function public.user_directory_carry_rename_records() from public, anon, authenticated;
