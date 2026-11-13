-- ===========================================================================
-- 0484 -- A COUNT OF THE SAME LINE AT THE SAME MOMENT IS REFUSED IN WORDS.
--
-- Reported 2026-11-13, on the first upload after 0483:
--   duplicate key value violates unique constraint
--   "handstock_reconciliations_uniq" (row ~1) (0 written before it stopped.)
-- Since 0483 every row of an upload takes the ONE date and time picked on the
-- screen, so a line (engineer + part) given twice in a file, or a file
-- uploaded again at the same time, meets the index on (engineer, part,
-- moment) -- which answers in the index's name and names no line. The guard
-- now asks first and says which part, which engineer, and where the other
-- count came from (this file, an earlier upload by its batch number, or the
-- screen). The index stays: it is the rule; this is its explanation.
-- 0483's guard, read out of a database built from every migration; one
-- block added before the later-count check.
-- ===========================================================================

create or replace function public.handstock_reconciliations_bi()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_later timestamptz;
  v_same  record;
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
  -- THE SAME LINE AT THE SAME MOMENT (0484): said in words, naming where the
  -- other count came from, instead of the unique index's own message.
  select k.upload_batch, k.source into v_same
    from public.handstock_reconciliations k
   where k.engineer_key = public.handstock_key(new.engineer)
     and k.part_code = public.part_code(new.part)
     and k.reconciled_at = new.reconciled_at
   limit 1;
  if found then
    if v_same.upload_batch <> '' and v_same.upload_batch = new.upload_batch then
      raise exception '% for % appears more than once in this file at %. Give each engineer + part once.',
        public.part_code(new.part), new.engineer,
        to_char(new.reconciled_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI')
        using errcode = '23505';
    end if;
    raise exception '% for % is already counted at % (%). Delete that count on Hand Stock -> Counts first, or give this count a different date and time.',
      public.part_code(new.part), new.engineer,
      to_char(new.reconciled_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI'),
      case when v_same.upload_batch <> '' then 'upload ' || v_same.upload_batch else 'counted on the screen' end
      using errcode = '23505';
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
