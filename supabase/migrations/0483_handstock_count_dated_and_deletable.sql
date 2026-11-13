-- ===========================================================================
-- 0483 -- AN UPLOADED HAND STOCK COUNT CARRIES ITS OWN DATE AND TIME, BELONGS
-- TO AN UPLOAD BATCH, AND A WRONG COUNT CAN BE DELETED (the user, 2026-11-13:
-- "In the Bulk Upload, it needs to Collect the Date of Reco. And it says there
-- is no Natural Key, I need a Provision to Delete the Bulk uploads if it is
-- incorrect and the Stock should revert back.").
--
-- Settled with the user:
--   * the date of the count is a DATE AND TIME, picked once on the upload
--     screen, and a "Reco Date" column in the file overrides it for that row;
--   * a wrong count is DELETED PERMANENTLY (not voided) -- the whole upload at
--     once, or one count at a time, including counts saved on the screen;
--   * by whoever holds `handstock.reconcile`, the key that may make a count.
--
-- What changes:
--   1. `upload_batch` -- every row of one upload carries the same batch number
--      (made by the upload screen), so the upload can be deleted as a whole.
--   2. `handstock_reconciliations_bi()` (0468's, one change set): an UPLOADED
--      count keeps the date and time it was given -- not later than now --
--      where a screen count is still stamped now(). The stamped system
--      quantity is the balance AS AT that moment, and a count dated BEFORE a
--      later count of the same line is refused: the later one wins, so it
--      would change nothing, and a count that silently changes nothing is
--      worse than a refusal.
--   3. `delete_handstock_reconciliations(ids, batch)` deletes counts, as the
--      owner, for a holder of `handstock.reconcile`. Hand stock is DERIVED
--      (0468's filter reads the latest count), so deleting a count reverts the
--      line to what it was without it -- the earlier count, or the movements.
--      `record_audit` is armed on the table so each deletion is recorded.
-- ===========================================================================

alter table public.handstock_reconciliations add column if not exists upload_batch text not null default '';
create index if not exists handstock_reconciliations_batch_idx
  on public.handstock_reconciliations (upload_batch) where upload_batch <> '';

create or replace function public.handstock_reconciliations_bi()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_later timestamptz;
begin
  -- Who is the database's, whatever the client sent.
  new.recorded_by      := auth.uid();
  new.recorded_by_name := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  new.created_at       := now();
  new.remarks          := btrim(coalesce(new.remarks, ''));
  new.upload_batch     := btrim(coalesce(new.upload_batch, ''));
  -- WHEN (0483): an uploaded count keeps the date and time it was given; a
  -- count made on the screen is made now.
  if new.source = 'Upload' and new.reconciled_at is not null then
    if new.reconciled_at > now() + interval '5 minutes' then
      raise exception 'The reconciliation date and time of % for % (%) is in the future.',
        public.part_code(new.part), new.engineer,
        to_char(new.reconciled_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI')
        using errcode = '23514';
    end if;
  else
    new.reconciled_at := now();
    if new.source <> 'Upload' then new.upload_batch := ''; end if;
  end if;
  if not exists (select 1 from public.user_directory u
                  where u.validity and lower(btrim(u.name)) = public.handstock_key(new.engineer)) then
    raise exception 'Hand stock is reconciled only for an ACTIVE person on the User Master -- "%" is not one.', new.engineer
      using errcode = '23514';
  end if;
  if not exists (select 1 from public.parts p where lower(btrim(p.item_detail)) = lower(btrim(new.part))) then
    raise exception 'Choose the part from the Part Master -- "%" is not on it.', new.part using errcode = '23514';
  end if;
  if public.part_code(new.part) = any (public.labour_part_codes()) then
    raise exception '% is a labour charge, which is not hand stock (0413) -- there is nothing to count.', public.part_code(new.part)
      using errcode = '23514';
  end if;
  if new.physical_qty is null or new.physical_qty < 0 or new.physical_qty <> trunc(new.physical_qty) then
    raise exception 'The physical quantity of % must be a whole number, 0 or more.', public.part_code(new.part)
      using errcode = '23514';
  end if;
  -- A LATER COUNT OF THE SAME LINE WINS (0468's filter), so a count dated
  -- before it would change nothing. Refused, naming the later one.
  select max(k.reconciled_at) into v_later
    from public.handstock_reconciliations k
   where k.engineer_key = public.handstock_key(new.engineer)
     and k.part_code = public.part_code(new.part)
     and k.reconciled_at > new.reconciled_at;
  if v_later is not null then
    raise exception 'A later count of % for % exists (%), so a count dated % would change nothing. Delete that count first, or date this one after it.',
      public.part_code(new.part), new.engineer,
      to_char(v_later at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI'),
      to_char(new.reconciled_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI')
      using errcode = '23514';
  end if;
  -- What the system said AT THAT MOMENT, before this count: the movements
  -- entered before it (a movement with no entry time counts as before every
  -- count, as in 0468's filter). Read as the owner, so it is the whole
  -- balance, not the part of it the reader may see.
  select coalesce(sum(case when m.direction = 'IN' then m.qty else -m.qty end), 0)
    into new.system_qty
    from public.handstock_movements m
   where m.engineer_key = public.handstock_key(new.engineer) and m.part_code = public.part_code(new.part)
     and coalesce(m.entered_at, '-infinity'::timestamptz) < new.reconciled_at;
  return new;
end $$;
revoke execute on function public.handstock_reconciliations_bi() from public, anon, authenticated;

-- DELETE A WRONG COUNT: the listed counts, or every count of one upload.
create or replace function public.delete_handstock_reconciliations(p_ids bigint[] default null, p_batch text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_batch text := btrim(coalesce(p_batch, ''));
begin
  if not coalesce((select public.has_perm('handstock.reconcile')), false) then
    raise exception 'Deleting a hand stock count needs "Reconcile hand stock to a physical count" on Roles & Permissions.'
      using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 and v_batch = '' then
    raise exception 'Name the counts, or the upload, to delete.' using errcode = '22023';
  end if;
  delete from public.handstock_reconciliations k
   where (coalesce(cardinality(p_ids), 0) > 0 and k.id = any (p_ids))
      or (v_batch <> '' and k.upload_batch = v_batch);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.delete_handstock_reconciliations(bigint[], text) from public, anon;
grant execute on function public.delete_handstock_reconciliations(bigint[], text) to authenticated;

-- Every insert and deletion of a count is recorded (0048's record_audit).
do $on$
begin
  if to_regprocedure('public.record_audit_fn()') is not null then
    drop trigger if exists record_audit_i on public.handstock_reconciliations;
    drop trigger if exists record_audit_d on public.handstock_reconciliations;
    create trigger record_audit_i after insert on public.handstock_reconciliations
      referencing new table as new_rows for each statement execute function public.record_audit_fn();
    create trigger record_audit_d after delete on public.handstock_reconciliations
      referencing old table as old_rows for each statement execute function public.record_audit_fn();
  end if;
end $on$;
