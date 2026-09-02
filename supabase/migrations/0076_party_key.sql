-- ===========================================================================
-- PARTY KEY — a readable identifier for each customer: Party-1, Party-2, …
--
-- Two things at once, and the second matters more than it looks:
--
--   1. Every party gets a short, stable handle to refer to. Assigned ONCE on
--      insert and never reassigned — a key that moves is not a key.
--
--   2. `parties` had NO unique constraint at all, so re-running an upload
--      ADDED another copy of every row. On a 5,874-row master that is a
--      catastrophe you only notice later, when the pickers show everything
--      twice. `name_key` makes the party name the natural key, so a re-load
--      CORRECTS rather than duplicates.
--
-- `name_key` is a STORED generated column rather than an expression index,
-- because `on conflict` cannot infer an expression index — the upload's upsert
-- would be refused outright. (The same trap 0071 and 0074 sprang.)
-- ===========================================================================

alter table public.parties add column if not exists party_key text;
alter table public.parties
  add column if not exists name_key text generated always as (lower(btrim(party_name))) stored;

-- ---------------------------------------------------------------------------
-- The series. A table rather than a sequence, so the go-live reset can empty it
-- with the other counters and production starts again at Party-1 — a sequence
-- would have to be reset separately and would be forgotten.
-- ---------------------------------------------------------------------------
create table if not exists public.party_key_seq (
  singleton boolean primary key default true check (singleton),
  last_no   bigint not null default 0
);

create or replace function public.next_party_key()
returns text language plpgsql security definer set search_path = public as $$
declare v_no bigint;
begin
  insert into public.party_key_seq (singleton, last_no)
  values (true, coalesce((select max(nullif(regexp_replace(party_key, '^Party-', ''), '')::bigint)
                            from public.parties where party_key ~ '^Party-[0-9]+$'), 0))
  on conflict (singleton) do nothing;

  update public.party_key_seq set last_no = last_no + 1 returning last_no into v_no;
  return 'Party-' || v_no;
end $$;
grant execute on function public.next_party_key() to authenticated;

create or replace function public.parties_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- A key that moves is not a key: keep whatever the row was given.
    new.party_key := coalesce(nullif(btrim(old.party_key), ''), new.party_key);
  end if;
  new.party_name := btrim(coalesce(new.party_name, ''));
  return new;
end $$;

drop trigger if exists parties_biu on public.parties;
create trigger parties_biu before insert or update on public.parties
  for each row execute function public.parties_before_write();

-- ---------------------------------------------------------------------------
-- The key is assigned AFTER the insert, not before it — and that is the whole
-- point of putting it here.
--
-- A BEFORE INSERT trigger fires on every attempted insert, INCLUDING the ones
-- that `on conflict do update` then turns into updates. Re-uploading the
-- 5,874-row Party Master would burn 5,874 numbers each time and the next real
-- party would come out as Party-11749 — a series with holes the size of the
-- file. AFTER INSERT fires only for rows that were genuinely inserted, so the
-- numbering follows the parties, not the upload attempts.
-- ---------------------------------------------------------------------------
create or replace function public.parties_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(new.party_key, '')) = '' then
    update public.parties set party_key = public.next_party_key() where id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists parties_aii on public.parties;
create trigger parties_aii after insert on public.parties
  for each row execute function public.parties_after_insert();

-- Backfill anything already loaded, oldest first so the numbering follows the
-- order the parties were actually created.
do $$
declare r record;
begin
  for r in select id from public.parties
            where coalesce(btrim(party_key), '') = '' order by id loop
    update public.parties set party_key = public.next_party_key() where id = r.id;
  end loop;
end $$;

create unique index if not exists parties_party_key_uniq on public.parties (party_key)
  where party_key is not null;
-- THE point of the exercise: a second upload of the same file corrects its rows
-- instead of adding 5,874 more.
create unique index if not exists parties_name_key_uniq on public.parties (name_key);
create index if not exists parties_party_key_idx on public.parties (party_key);
