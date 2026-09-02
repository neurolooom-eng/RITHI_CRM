-- ===========================================================================
-- Make 0079's keys actually usable by `on conflict`.
--
-- 0079 built them PARTIAL — `where code_key <> ''` and `where machine_key <>
-- '|'` — and Postgres cannot infer a partial index from `on conflict (col)`.
-- So the index existed, `_status.sql` read yes, and the upload still failed
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Exactly the trap 0071, 0074, 0076 and 0077 each hit; I wrote
-- it into the migration that was meant to be the fix.
--
-- Full indexes instead. The predicate was excluding the keyless row, which does
-- not need excluding: a part with no code, or a machine with neither model nor
-- serial, is not a record — at most one such row can exist, which is the right
-- answer rather than a limitation.
--
-- `scripts/check-upsert-targets.mjs` now checks every register's conflict target
-- against a real database, so this class cannot ship again by inspection alone.
--
-- LIVES IN THE handstock MODULE. It fixes indexes on parts and products (created
-- in masters, an EARLIER module — fine) and on spare_consumption.source_ref,
-- which 0078 adds HERE. From masters it ran before that column existed and
-- all.sql died on it. 0082 follows it in the same module, since it drops an
-- index this file creates and must not run first.
-- ===========================================================================

drop index if exists public.parts_code_key_uniq;
do $$
begin
  if exists (select 1 from public.parts group by code_key having count(*) > 1) then
    raise notice 'parts holds duplicate codes — de-duplicate, then re-run this file to build parts_code_key_uniq.';
  else
    create unique index if not exists parts_code_key_uniq on public.parts (code_key);
  end if;
end $$;

drop index if exists public.products_machine_key_uniq;
do $$
begin
  if exists (select 1 from public.products group by machine_key having count(*) > 1) then
    raise notice 'products holds duplicate model+serial — de-duplicate, then re-run this file to build products_machine_key_uniq.';
  else
    create unique index if not exists products_machine_key_uniq on public.products (machine_key);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- spare_consumption, found by that same check.
--
-- 0078 indexed `source_ref` PARTIALLY (`where source_ref <> ''`) because a line
-- entered in the app has no source reference and many blanks cannot share a
-- unique index. The predicate was necessary, and it made the index
-- un-inferable, so the Consumption upload would have failed exactly as Part
-- Master did.
--
-- A NULLABLE key solves both at once: NULLs are DISTINCT in a unique index, so
-- every app-entered line coexists happily while imported lines are still unique
-- on their source reference — and the index is full, so `on conflict` can infer
-- it.
-- ---------------------------------------------------------------------------
alter table public.spare_consumption
  add column if not exists source_ref_key text generated always as (nullif(btrim(source_ref), '')) stored;

drop index if exists public.spare_consumption_source_ref_uniq;
do $$
begin
  if exists (select 1 from public.spare_consumption
              where nullif(btrim(source_ref), '') is not null
              group by nullif(btrim(source_ref), '') having count(*) > 1) then
    raise notice 'spare_consumption holds duplicate source references — de-duplicate, then re-run this file.';
  else
    create unique index if not exists spare_consumption_source_ref_uniq
      on public.spare_consumption (source_ref_key);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The adjustment guard must not block a RE-IMPORT.
--
-- 0062 insists a quantity change carries a reason, so a reconciler cannot
-- silently restate a line. That is right, and it stays right — for a person
-- correcting a line in the app.
--
-- It is wrong for a bulk re-load. Re-importing a corrected consumption sheet is
-- the SOURCE SYSTEM restating itself, not somebody adjusting a figure; demanding
-- a typed reason per row across 8,335 lines is not a control, it is a wall that
-- simply stops the load. And a re-load that cannot correct is the whole point of
-- giving the table a key in the first place.
--
-- So the exemption is exactly one case and no wider: a line that CAME FROM an
-- import (source_ref present) and is still the same import (source_ref
-- unchanged). A line entered in the app has no source_ref and is untouched by
-- this — the reconciler still has to say why. The before/after is recorded by
-- the audit trail (0048) either way, so nothing becomes unaccountable.
-- ---------------------------------------------------------------------------
create or replace function public.consumption_adjust_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare avail numeric; delta numeric;
begin
  if coalesce(new.ucn, '')      is distinct from coalesce(old.ucn, '')
  or coalesce(new.part, '')     is distinct from coalesce(old.part, '')
  or coalesce(new.engineer, '') is distinct from coalesce(old.engineer, '')
  or coalesce(new.source, '')   is distinct from coalesce(old.source, '') then
    raise exception 'A reconciliation can only change the quantity — not the call, part, engineer or source';
  end if;

  if new.qty is not distinct from old.qty then
    return new;                        -- nothing quantitative changed
  end if;
  if coalesce(new.qty, 0) < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  -- The one exemption: the same imported line, re-loaded from its source.
  if coalesce(btrim(new.source_ref), '') <> ''
     and btrim(new.source_ref) is not distinct from btrim(old.source_ref) then
    return new;
  end if;

  if coalesce(new.qty, 0) <= 0 and coalesce(btrim(new.adjustment_reason), '') = '' then
    raise exception 'Say why the line is being voided — the reason is kept with it';
  end if;
  if coalesce(btrim(new.adjustment_reason), '') = '' then
    raise exception 'Say why the quantity is being adjusted — the reason is kept with the line';
  end if;

  -- A RAISE still has to fit in the engineer's hand stock; a reduction never does.
  delta := coalesce(new.qty, 0) - coalesce(old.qty, 0);
  if delta > 0 then
    select coalesce(b.on_hand, 0) into avail
      from public.handstock_balance b
     where b.engineer_key = public.handstock_key(new.engineer)
       and b.part_code = public.part_code(new.part);
    if coalesce(avail, 0) < delta then
      raise exception '% has % of % in hand, so the line cannot be raised by %. Ask the Spare Coordinator to correct the hand stock first.',
        new.engineer, coalesce(avail, 0), public.part_code(new.part), delta;
    end if;
  end if;

  if old.original_qty is null then new.original_qty := old.qty; end if;
  new.adjusted_at := now();
  return new;
end $$;
