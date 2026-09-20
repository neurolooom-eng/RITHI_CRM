-- ===========================================================================
-- "IT SHOULD BE ALIVE DATA" (the user, 2026-09-20), and a Rebuild button is
-- not alive — it is a chore that somebody has to remember, on a screen they
-- are about to make the primary product list for the whole application.
--
-- THE CONFLICT IS REAL AND THIS IS HOW IT IS RESOLVED. Deriving these machines
-- on demand measured 2,936 ms a page and timed out (0220); storing them
-- measured 3 ms and goes stale. So the storage stays, and what changes is WHO
-- NOTICES: the five registers now tell the storage when they have moved, and a
-- scheduled job acts on it. Nobody presses anything.
--
--   1. A STATEMENT-LEVEL trigger on each source sets `stale`. Statement-level,
--      not row-level, and that is the whole reason this is affordable: a bulk
--      upload of 12,000 warranty items is ONE statement, so it costs ONE flag
--      write, not 12,000 — a structural property of `for each statement`, not
--      an optimisation to be hoped for. Timed against a 12,000-row load it is
--      not distinguishable from noise, which is the point; a row-level trigger
--      here would have made every register upload slower than the problem it
--      was added to solve.
--   2. `refresh_product_database_2_if_stale()` rebuilds only when the flag is
--      set, CONCURRENTLY, so no reader is ever blocked.
--   3. pg_cron runs it every five minutes. Worst case the machines are five
--      minutes behind a register upload; typically far less, and the screen
--      SAYS which it is rather than leaving it to be guessed.
--
-- WHAT IS NOT DONE, DELIBERATELY: the refresh is not fired from the trigger
-- itself. That would rebuild once per statement of a bulk load — ten uploads
-- in a minute is ten full rebuilds, each of them wasted but the last — and a
-- `refresh materialized view` inside somebody's INSERT transaction makes their
-- upload wait on it. The flag separates "something changed" from "act on it",
-- which is the only reason this is cheap.
--
-- THE COVER STATUS IS ALREADY LIVE (0222) and is not what this file is about:
-- that half is computed on every read, so a warranty lapsing overnight is
-- visible immediately whether or not anything has been refreshed. This is
-- about the ASSEMBLY — a machine sold, transferred or put under contract.
-- ===========================================================================

alter table public.product_database_v2_state
  add column if not exists stale boolean not null default true;

comment on column public.product_database_v2_state.stale is
  'Set by the source registers when they change (0223); cleared by a refresh. The screen reads it to say whether it is showing live figures or figures waiting on the next rebuild.';

-- ---------------------------------------------------------------------------
-- "A REGISTER MOVED." Definer, because `product_database_v2_state` carries RLS
-- and has no UPDATE policy — deliberately, nobody should be writing it by
-- hand. Without definer every insert into a register would fail on the flag.
--
-- The conditional keeps a long bulk load off the row once it is already
-- flagged, so concurrent uploads do not queue on one row's lock.
-- ---------------------------------------------------------------------------
create or replace function public.pdv2_mark_stale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.product_database_v2_state
     set stale = true
   where only_row and not stale;
  return null;   -- statement-level: there is no row to return
end $$;
comment on function public.pdv2_mark_stale() is
  'Marks Product Database 2.0 as needing a rebuild. STATEMENT-level, so a 12,000-row upload costs one write (0223).';

do $$
declare t text;
begin
  foreach t in array array[
    'sale_entries', 'sale_items',                 -- the warranty sale register
    'contract_entries', 'contract_items',         -- the contract register
    'product_additional_entries',                 -- the machines recovered by hand
    'ownership_transfers',                        -- who owns it now
    'installation_calls', 'feedback'              -- where a warranty actually starts
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists zz_pdv2_stale on public.%I', t);
      execute format(
        'create trigger zz_pdv2_stale after insert or update or delete on public.%I '
        'for each statement execute function public.pdv2_mark_stale()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- THE SCHEDULED REBUILD. Returns what it did, so the job's history says
-- whether it is working rather than only that it ran.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_product_database_2_if_stale()
returns text language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.product_database_v2_state where only_row and stale) then
    return 'up to date';
  end if;
  refresh materialized view concurrently public.product_database_v2_mv;
  select count(*) into n from public.product_database_v2_mv;
  update public.product_database_v2_state
     set refreshed_at = now(), rows_built = n, stale = false
   where only_row;
  return 'rebuilt ' || n || ' machines';
end $$;
comment on function public.refresh_product_database_2_if_stale() is
  'Rebuild Product Database 2.0 only if a register has changed since the last one. Run every five minutes by pg_cron (0223).';
revoke all on function public.refresh_product_database_2_if_stale() from public;
grant execute on function public.refresh_product_database_2_if_stale() to authenticated;

-- The manual rebuild clears the flag too, or the scheduler would do the same
-- work again five minutes later.
create or replace function public.refresh_product_database_2()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not (public.has_perm('masters.edit') or public.has_perm('cover.edit') or public.is_admin()) then
    raise exception 'Your role may not rebuild Product Database 2.0.' using errcode = '42501';
  end if;
  refresh materialized view concurrently public.product_database_v2_mv;
  select count(*) into n from public.product_database_v2_mv;
  update public.product_database_v2_state
     set refreshed_at = now(), rows_built = n, refreshed_by = auth.uid(), stale = false
   where only_row;
  return (select refreshed_at from public.product_database_v2_state where only_row);
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'refresh-product-database-2') then
      perform cron.unschedule('refresh-product-database-2');
    end if;
    perform cron.schedule('refresh-product-database-2', '*/5 * * * *',
                          'select public.refresh_product_database_2_if_stale();');
  end if;
end $$;

-- Built by this migration, so it starts clean rather than claiming to be stale.
update public.product_database_v2_state set stale = false where only_row;

-- ---------------------------------------------------------------------------
-- THE SCREEN HAS TO BE ABLE TO SAY WHICH IT IS. "Built 20-Sep 22:57" on its own
-- cannot tell somebody whether that is the current picture or one waiting on a
-- rebuild, and those read identically while meaning opposite things. APPENDED
-- at the end, which is the only place `create or replace view` accepts a new
-- column.
-- ---------------------------------------------------------------------------
create or replace view public.product_database_v2 as
select
  m.machine_key, m.product_name, m.serial_number, m.product_code,
  m.party_name, m.party_from,
  m.warranty_start, m.warranty_months, m.warranty_end, m.warranty_from,
  public.cover_state(m.warranty_end)                     as warranty_state,
  m.contract_number, m.contract_type_as_recorded, m.contract_type,
  m.contract_start, m.contract_months, m.contract_end, m.contract_from,
  public.cover_state(m.contract_end)                     as contract_state,
  case
    when coalesce(m.warranty_end, '-infinity'::date) >= current_date then 'WGP'
    when coalesce(m.contract_end, '-infinity'::date) >= current_date
      then coalesce(public.contract_cover_code(m.contract_type_as_recorded),
                    'CONTRACT (TYPE NOT RECORDED)')
    else 'OGP'
  end                                                    as item_status,
  case
    when coalesce(m.warranty_end, '-infinity'::date) >= current_date
      then 'inside warranty — ' || coalesce(m.warranty_from, 'source not recorded')
    when coalesce(m.contract_end, '-infinity'::date) >= current_date
      then 'under contract — ' || coalesce(m.contract_from, 'source not recorded')
    else 'no warranty and no contract covers today'
  end                                                    as item_status_reason,
  m.sa_number, m.state, m.city, m.engineer,
  m.from_party, m.to_party, m.transfer_date, m.reference_no,
  m.in_warranty_register, m.in_contract_register, m.in_additional_entries,
  m.installation_ucn,
  s.refreshed_at,
  s.stale
from public.product_database_v2_mv m
cross join public.product_database_v2_state s;
alter view public.product_database_v2 set (security_invoker = on);
grant select on public.product_database_v2 to authenticated;
