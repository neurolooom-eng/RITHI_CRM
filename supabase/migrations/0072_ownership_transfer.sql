-- ===========================================================================
-- OWNERSHIP TRANSFER — a machine moves from one party to another.
--
-- `products` carries ONE party per serial: who owns the machine now. That is
-- what every call, warranty and contract reads. But a machine that changes
-- hands leaves no trace of it — the old owner is simply overwritten, and the
-- question "who had this machine when that call was raised" becomes
-- unanswerable. For a medical device that is a traceability gap, not an
-- inconvenience.
--
-- So the MOVEMENT is the record, and `products.party_name` is derived from it:
--   * the register keeps every hand-over, with its date and its paperwork
--   * a trigger moves the machine to the new party, so the two cannot disagree
--   * `from_party` is filled in from `products` when the sheet omits it, which
--     is what makes a bulk load of historical transfers usable
--
-- Calls already raised keep the party they were raised under — they happened
-- under the old owner, and rewriting them would be falsifying the record.
-- ===========================================================================

create table if not exists public.ownership_transfers (
  id             bigint generated always as identity primary key,
  serial_number  text not null,
  item_name      text not null default '',
  from_party     text not null default '',
  to_party       text not null,
  transfer_date  date,
  reference_no   text not null default '',   -- the customer's paperwork
  reason         text not null default '',
  remarks        text not null default '',
  document_url   text not null default '',   -- Drive link to the hand-over document
  recorded_by      uuid references auth.users (id),
  recorded_by_name text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ownership_transfer_parties_differ check (btrim(lower(from_party)) is distinct from btrim(lower(to_party)))
);

create index if not exists ownership_transfers_serial_idx on public.ownership_transfers (lower(serial_number));
create index if not exists ownership_transfers_date_idx   on public.ownership_transfers (transfer_date desc nulls last, id desc);

-- ---------------------------------------------------------------------------
-- Fill in what the sheet left out, then move the machine.
--
-- The order matters: `from_party` has to be read BEFORE products is updated, or
-- a bulk load of several transfers for one machine would record every hop as
-- starting from the same party.
-- ---------------------------------------------------------------------------
create or replace function public.ownership_transfer_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_serial text := btrim(coalesce(new.serial_number, ''));
begin
  if v_serial = '' then
    raise exception 'An ownership transfer needs the machine serial number.';
  end if;
  if btrim(coalesce(new.to_party, '')) = '' then
    raise exception 'An ownership transfer needs the party it is going to.';
  end if;

  if tg_op = 'INSERT' then
    new.recorded_by := coalesce(new.recorded_by, auth.uid());
    -- Who holds it now, per the machine master — the truthful "from".
    if btrim(coalesce(new.from_party, '')) = '' then
      select coalesce(p.party_name, '') into new.from_party
        from public.products p
       where lower(btrim(p.serial_number)) = lower(v_serial)
       limit 1;
    end if;
    if btrim(coalesce(new.item_name, '')) = '' then
      select coalesce(p.item_name, '') into new.item_name
        from public.products p
       where lower(btrim(p.serial_number)) = lower(v_serial)
       limit 1;
    end if;
  else
    new.recorded_by := old.recorded_by;   -- authorship is not editable
    new.created_at  := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ownership_transfer_biu on public.ownership_transfers;
create trigger ownership_transfer_biu before insert or update on public.ownership_transfers
  for each row execute function public.ownership_transfer_apply();

-- The machine follows the LATEST transfer, applied after the row lands so the
-- "from" above was read against the previous state.
create or replace function public.ownership_transfer_move()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_serial text := lower(btrim(coalesce(new.serial_number, '')));
begin
  -- Only the most recent transfer for this machine decides who holds it, so a
  -- back-dated row loaded after a later one does not undo it.
  if exists (
    select 1 from public.ownership_transfers t
     where lower(btrim(t.serial_number)) = v_serial
       and t.id <> new.id
       and (coalesce(t.transfer_date, '0001-01-01') > coalesce(new.transfer_date, '0001-01-01')
        or (coalesce(t.transfer_date, '0001-01-01') = coalesce(new.transfer_date, '0001-01-01') and t.id > new.id))
  ) then
    return null;
  end if;

  update public.products p
     set party_name = new.to_party
   where lower(btrim(p.serial_number)) = v_serial
     and coalesce(p.party_name, '') is distinct from new.to_party;
  return null;
end $$;

drop trigger if exists ownership_transfer_aiu on public.ownership_transfers;
create trigger ownership_transfer_aiu after insert or update on public.ownership_transfers
  for each row execute function public.ownership_transfer_move();

-- ---------------------------------------------------------------------------
-- Access. Moving a machine between customers changes what every future call,
-- warranty and contract reads, so it is its own right rather than folded into
-- masters.edit. Everyone signed in may READ the history — it is the answer to
-- "who owned this when".
-- ---------------------------------------------------------------------------
alter table public.ownership_transfers enable row level security;
grant select, insert, update, delete on public.ownership_transfers to authenticated;

drop policy if exists ownership_read on public.ownership_transfers;
create policy ownership_read on public.ownership_transfers for select
  using (auth.role() = 'authenticated');

drop policy if exists ownership_write on public.ownership_transfers;
create policy ownership_write on public.ownership_transfers for all
  using (public.has_perm('ownership.transfer'))
  with check (public.has_perm('ownership.transfer'));

-- Grant it where the work already sits, by MERGING — never overwriting, since
-- an admin may have tuned the role.
do $$
declare r record;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  for r in select role, coalesce(permissions, '[]'::jsonb) as perms from public.app_roles loop
    if r.role in ('admin', 'commercial', 'hotline') and not (r.perms ? 'ownership.transfer') then
      update public.app_roles set permissions = r.perms || '["ownership.transfer"]'::jsonb, updated_at = now()
       where role = r.role;
    end if;
  end loop;
  update public.app_roles
     set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/ownership-transfer"]'::jsonb, updated_at = now()
   where not (coalesce(permissions, '[]'::jsonb) ? 'mod:/ownership-transfer');
end $$;
