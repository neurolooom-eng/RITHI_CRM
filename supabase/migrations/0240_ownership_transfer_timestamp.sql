-- ===========================================================================
-- AN OWNERSHIP TRANSFER RECORDS THE MOMENT IT HAPPENED, NOT JUST THE DAY.
--
-- The user, 2026-09-24: "Record the Timestamp in Ownership Transfer as well.
-- Ideally all the tables should record the Timestamp, and every Table should
-- have a Key on its own."
--
-- THIS IS THE MISSING HALF OF 0238's RULE. "The party is decided by the sale
-- entry or the ownership transfer, whichever is latest" needs both sides to be
-- comparable, and they were not: a sale entry carries a TIMESTAMP and
-- `transfer_date` is a DATE. So a transfer recorded at two in the afternoon on
-- the day of a sale entered that morning compared as MIDNIGHT and lost. 0238
-- papered over it with a tie-break -- a transfer dated the same day wins,
-- since a machine cannot be transferred before it is sold -- which is the right
-- answer for that case and merely a guess for the reverse one: a machine
-- transferred in the morning and SOLD ON in the afternoon read as transferred.
--
-- `transferred_at` MAKES THE COMPARISON EXACT and the tie-break stops being
-- load-bearing. It is kept, because two events can still share an instant and
-- something has to decide.
--
-- WHAT THE EXISTING ROWS GET. `created_at` -- when the row was actually written,
-- which is literally "the Timestamp of when the change was done". Where a row
-- has none, the transfer date at midnight, which is all that was ever recorded
-- about it and is not improved by inventing an hour.
--
-- `transfer_date` IS NOT DROPPED AND NOT DERIVED FROM THIS. It is the day the
-- machine changed hands, which is a fact about the business; `transferred_at`
-- is when the system was told. They routinely differ -- a transfer agreed on
-- Friday and entered on Monday -- and collapsing them would lose the first.
-- ===========================================================================

alter table public.ownership_transfers
  add column if not exists transferred_at timestamptz;

comment on column public.ownership_transfers.transferred_at is
  'When this transfer was RECORDED, to the second. transfer_date is the day the machine changed hands; these differ and both are kept. Used to order a transfer against a sale entry.';

-- Backfill, then default. In that order: a default set first would leave the
-- existing rows null anyway, and doing it after means one pass.
update public.ownership_transfers
   set transferred_at = coalesce(created_at, transfer_date::timestamptz)
 where transferred_at is null;

alter table public.ownership_transfers
  alter column transferred_at set default now();

-- ---- the rule now compares two timestamps ---------------------------------
create or replace function public.machine_current_party(p_item_name text, p_serial text)
returns text language sql stable set search_path = public as $$
  with m as (select lower(btrim(coalesce(p_item_name, ''))) as n,
                    lower(btrim(coalesce(p_serial, '')))    as s),
  sale as (
    select coalesce(h.party_name, '') as party, coalesce(h.entry_at, i.created_at) as at
      from public.sale_items i
      join public.sale_entries h on h.sa_number = i.sa_number, m
     where lower(btrim(coalesce(i.product_name, ''))) = m.n
       and lower(btrim(coalesce(i.serial_number, ''))) = m.s
     order by coalesce(h.entry_at, i.created_at) desc nulls last, i.id desc
     limit 1),
  xfer as (
    -- `transferred_at` first, the DATE only where a row predates it and has no
    -- created_at either. Ordered the same way it is compared, or the row picked
    -- here would not be the row the comparison then uses.
    select coalesce(t.to_party, '') as party,
           coalesce(t.transferred_at, t.created_at, t.transfer_date::timestamptz) as at
      from public.ownership_transfers t, m
     where lower(btrim(coalesce(t.item_name, ''))) = m.n
       and lower(btrim(coalesce(t.serial_number, ''))) = m.s
       and btrim(coalesce(t.to_party, '')) <> ''
     order by coalesce(t.transferred_at, t.created_at, t.transfer_date::timestamptz) desc nulls last,
              t.id desc
     limit 1)
  -- THE TRANSFER STILL WINS AN EXACT TIE. Two events sharing an instant need a
  -- decision, and a machine cannot be transferred before it is sold.
  select case
    when not exists (select 1 from xfer) then (select party from sale)
    when not exists (select 1 from sale) then (select party from xfer)
    when (select at from xfer) >= (select at from sale) then (select party from xfer)
    else (select party from sale)
  end;
$$;

-- ---- re-derive, since the ordering can now differ within a day ------------
do $$
declare n bigint;
begin
  update public.products p
     set party_name = public.machine_current_party(p.item_name, p.serial_number)
   where exists (select 1 from public.ownership_transfers t
                  where lower(btrim(coalesce(t.item_name, ''))) = lower(btrim(coalesce(p.item_name, '')))
                    and lower(btrim(coalesce(t.serial_number, ''))) = lower(btrim(coalesce(p.serial_number, ''))));
  get diagnostics n = row_count;
  raise notice '0240: % transferred machine(s) re-checked against the exact times.', n;
end $$;
