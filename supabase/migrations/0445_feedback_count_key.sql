-- ===========================================================================
-- 0445 -- A SECOND FEEDBACK ON ONE CALL IS KEPT, KEYED WITH ITS COUNT (the
-- user, 2026-10-15, on a Visit Entry for 25L01P0232 that answered "The visit
-- and the spares were saved, but the customer feedback was not: duplicate key
-- value violates unique constraint "feedback_ucn_key_uniq"": "For feedback it
-- is ok to overwrite or duplicate. If it's a duplicate -- add the count along
-- with the key so it becomes unique").
--
-- The call was solved, re-opened and solved again: its first feedback held the
-- key `25l01p0232`, and the visit form's plain insert of the second one was
-- refused (D-035). The visit and its spares were already written.
--
-- WHAT CHANGES. `ucn_key` was GENERATED from the UCN, so a call could carry
-- one feedback and no more. It becomes an ordinary column that the database
-- writes (feedback_key_stamp, below), with two paths:
--
--   * A ROW THAT SENDS NO KEY -- the Customer Feedback upload, which upserts
--     on `ucn_key` -- gets the call's own key, exactly as before, so a
--     re-loaded file still CORRECTS the feedback it matches (the overwrite).
--   * A ROW THAT SENDS A KEY -- the Visit Entry form -- is a NEW feedback on
--     the call: it gets the call's own key while that is free, and otherwise
--     the key with its count, `25l01p0232-2`, `-3`, ... (the duplicate). The
--     value sent is never stored; the database works the key out, so a caller
--     cannot write a key that belongs to another call.
--
-- The key is still unique and still a total btree index, so check:upserts and
-- the upload are unaffected. A blank UCN still keys off its own row
-- (`row-<id>`). The function is SECURITY DEFINER so it sees every feedback on
-- the call, including ones the person saving may not read -- otherwise it
-- would offer a key already taken and the insert would fail as before.
--
-- Existing rows keep their keys: the column's values are kept when the
-- expression is dropped.
-- ===========================================================================

create or replace function public.feedback_key_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base text := coalesce(nullif(lower(btrim(coalesce(new.ucn, ''))), ''), 'row-' || new.id);
  v_key  text;
  v_n    int := 1;
begin
  -- A table being rebuilt by 0188's repair can be without the column for a
  -- moment; there is then nothing to write.
  if not (to_jsonb(new) ? 'ucn_key') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- The key follows the UCN and nothing else: an edit that keeps the UCN
    -- keeps the key, whatever it sends.
    if lower(btrim(coalesce(new.ucn, ''))) is not distinct from lower(btrim(coalesce(old.ucn, ''))) then
      new.ucn_key := old.ucn_key;
      return new;
    end if;
    -- A UCN corrected to another call: that call's key, counted if it is taken.
    new.ucn_key := 'next';
  end if;

  if new.ucn_key is null or btrim(new.ucn_key) = '' then
    -- The upload's path: the call's own key, so ON CONFLICT (ucn_key) finds
    -- and corrects the feedback already there.
    new.ucn_key := v_base;
    return new;
  end if;

  -- A new feedback on the call: the first free key, counted from 2.
  perform pg_advisory_xact_lock(hashtext('feedback_key:' || v_base));
  v_key := v_base;
  while exists (select 1 from public.feedback f
                 where f.ucn_key = v_key
                   and (tg_op = 'INSERT' or f.id <> new.id)) loop
    v_n := v_n + 1;
    v_key := v_base || '-' || v_n;
  end loop;
  new.ucn_key := v_key;
  return new;
end $$;

comment on function public.feedback_key_stamp() is
  'Writes feedback.ucn_key (0445). No key sent (the upload): the call''s own key, so a re-load corrects. A key sent (the Visit Entry form): a new feedback on the call -- the call''s key while free, else the key with its count (-2, -3 ...). The value sent is never stored.';

revoke execute on function public.feedback_key_stamp() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.feedback') is null then
    raise notice '0445: public.feedback is absent -- nothing to do';
    return;
  end if;
  -- The column stops being generated; its values stay.
  if exists (select 1 from pg_attribute
              where attrelid = 'public.feedback'::regclass and attname = 'ucn_key'
                and attgenerated = 's') then
    execute 'alter table public.feedback alter column ucn_key drop expression';
    raise notice '0445: feedback.ucn_key is now written by feedback_key_stamp()';
  end if;
  execute 'drop trigger if exists feedback_key_stamp on public.feedback';
  execute 'create trigger feedback_key_stamp before insert or update on public.feedback
             for each row execute function public.feedback_key_stamp()';
end $$;

comment on index public.feedback_ucn_key_uniq is
  'The feedback key, unique. The upload sends no key and gets the call''s own, so a re-load corrects (0186). The Visit Entry form''s second feedback on a call gets the key with its count, -2, -3 ... (0445, the user 2026-10-15). A row with no UCN keys off its own id.';
