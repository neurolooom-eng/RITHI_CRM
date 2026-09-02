-- ===========================================================================
-- ADDITIONAL ENTRY DETAILS — warranty for a machine whose sale entry is lost.
--
-- `sync_product_cover()` (0036) derives a machine's warranty and contract from
-- the Sale and Contract registers. That is right when the paperwork exists. For
-- an older machine whose Sale Entry never made it into the system, it leaves
-- the machine with no warranty at all — and a call against it reads as
-- out-of-warranty, which is a commercial decision made on missing data.
--
-- This is the second source: warranty (and contract) recorded directly against
-- a serial, for machines that have no entry to derive from. It is NOT a way to
-- overrule the registers — `sync_product_cover` reads it only where a real Sale
-- or Contract item is absent, so the moment the paperwork is loaded the
-- authoritative record wins and this stops being consulted.
--
-- `source_note` records WHERE the detail came from (the customer's copy, an old
-- invoice, an engineer's file). A recovered warranty date with no provenance is
-- an assertion; with one it is evidence.
-- ===========================================================================

create table if not exists public.product_additional_entries (
  id              bigint generated always as identity primary key,
  serial_number   text not null,
  item_name       text not null default '',
  party_name      text not null default '',
  warranty_number text not null default '',
  warranty_start  date,
  warranty_end    date,
  contract_number text not null default '',
  contract_type   text not null default '',
  contract_start  date,
  contract_end    date,
  source_note     text not null default '',   -- where this detail came from
  document_url    text not null default '',
  remarks         text not null default '',
  recorded_by      uuid references auth.users (id),
  recorded_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One recovered entry per machine: a second one is a correction of the first,
-- not another record, so the upload can upsert on it.
create unique index if not exists product_additional_entries_serial_uniq
  on public.product_additional_entries (lower(btrim(serial_number)));

create or replace function public.product_additional_entry_biu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(new.serial_number, '')) = '' then
    raise exception 'An additional entry needs the machine serial number.';
  end if;
  if tg_op = 'INSERT' then new.recorded_by := coalesce(new.recorded_by, auth.uid());
  else new.recorded_by := old.recorded_by; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists product_additional_entry_biu on public.product_additional_entries;
create trigger product_additional_entry_biu before insert or update on public.product_additional_entries
  for each row execute function public.product_additional_entry_biu();

-- Push it onto the machine as soon as it is recorded, so Product Master shows
-- it without waiting for a cover re-sync.
create or replace function public.product_additional_entry_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_product_cover(new.serial_number);
  return null;
end $$;
drop trigger if exists product_additional_entry_aiu on public.product_additional_entries;
create trigger product_additional_entry_aiu after insert or update on public.product_additional_entries
  for each row execute function public.product_additional_entry_apply();

-- ---------------------------------------------------------------------------
-- Teach sync_product_cover the second source.
--
-- Ranked BELOW the real registers on purpose: a Sale Item wins wherever one
-- exists, so loading the genuine paperwork later silently corrects a recovered
-- guess rather than being blocked by it. Same shape as the original (0036) —
-- indexed single-serial lookups, because an import fires this once per item.
-- ---------------------------------------------------------------------------
create or replace function public.sync_product_cover(p_serial text)
returns void language plpgsql security definer set search_path = public as $$
declare k text := lower(trim(coalesce(p_serial, ''))); w record; c record; a record;
begin
  if k = '' then return; end if;

  select i.sa_number, coalesce(i.warranty_start, h.warranty_start) as warranty_start,
         coalesce(i.warranty_end, h.warranty_end) as warranty_end
    into w
    from public.sale_items i join public.sale_entries h on h.sa_number = i.sa_number
   where lower(trim(i.serial_number)) = k
   order by coalesce(i.warranty_end, h.warranty_end) desc nulls last, i.id desc limit 1;

  select i.mc_number, coalesce(i.contract_type, h.contract_type) as contract_type,
         coalesce(i.contract_start, h.contract_start) as contract_start,
         coalesce(i.contract_end, h.contract_end) as contract_end
    into c
    from public.contract_items i join public.contract_entries h on h.mc_number = i.mc_number
   where lower(trim(i.serial_number)) = k
   order by coalesce(i.contract_end, h.contract_end) desc nulls last, i.id desc limit 1;

  -- The recovered detail, used only where the registers are silent.
  if to_regclass('public.product_additional_entries') is not null then
    select e.warranty_number, e.warranty_start, e.warranty_end,
           e.contract_number, e.contract_type, e.contract_start, e.contract_end
      into a
      from public.product_additional_entries e
     where lower(btrim(e.serial_number)) = k limit 1;
  end if;

  update public.products p set
    warranty_number = coalesce(w.sa_number, nullif(a.warranty_number, ''), p.warranty_number),
    warranty_start  = coalesce(w.warranty_start, a.warranty_start, p.warranty_start),
    warranty_end    = coalesce(w.warranty_end,   a.warranty_end,   p.warranty_end),
    contract_number = coalesce(c.mc_number, nullif(a.contract_number, ''), p.contract_number),
    contract_start  = coalesce(c.contract_start, a.contract_start, p.contract_start),
    contract_end    = coalesce(c.contract_end,   a.contract_end,   p.contract_end),
    contract_type   = coalesce(nullif(c.contract_type, ''), nullif(a.contract_type, ''), p.contract_type),
    item_status     = case
      when coalesce(c.contract_end, a.contract_end) >= current_date
        then coalesce(nullif(c.contract_type, ''), nullif(a.contract_type, ''), 'CMC')
      when coalesce(w.warranty_end, a.warranty_end) >= current_date then 'WARRANTY'
      else p.item_status end
  where lower(trim(p.serial_number)) = k;
end $$;
grant execute on function public.sync_product_cover(text) to authenticated;

alter table public.product_additional_entries enable row level security;
grant select, insert, update, delete on public.product_additional_entries to authenticated;

drop policy if exists pae_read on public.product_additional_entries;
create policy pae_read on public.product_additional_entries for select
  using (auth.role() = 'authenticated');

-- Same right that governs the Sale and Contract registers: this IS cover data,
-- recorded by a different route.
drop policy if exists pae_write on public.product_additional_entries;
create policy pae_write on public.product_additional_entries for all
  using (public.has_perm('cover.edit'))
  with check (public.has_perm('cover.edit'));
