-- ===========================================================================
-- ProdHistory_05 — LOOKING ONE MACHINE'S CALLS UP AS AN EQUALITY.
--
-- RUN THIS ON THE LIVE PROJECT (issxxmgsffszqbxugqis).
--
-- Optional in the sense that Product History works without it, which is the
-- kind of optional that gets skipped and comes back as "the history screen is
-- slow". It is one machine: an equality on a serial, over three registers
-- holding tens of thousands of calls.
--
-- ── This is 0129 again, one table along ────────────────────────────────────
--
-- 0129 hit exactly this on `products` and wrote down the answer: an EXPRESSION
-- index cannot be reached through PostgREST, because a client cannot write
-- `lower(btrim(serial_number))` in a filter. The fix was a stored generated
-- column — `products.serial_key` — which a client CAN filter on, indexed like
-- any other column.
--
-- The three call tables carry `calls_serial_idx on (lower(serial))`, inherited
-- when 0040 cloned them from `public.calls` with LIKE INCLUDING ALL. Same
-- expression index, same unreachability: `.eq('serial', …)` asks about the raw
-- column, the index is on the lowered one, and the planner uses neither — so
-- every history lookup scans all three tables. "There is an index on serial"
-- is true and does not help, which is what made this worth a file of its own.
--
-- ── Why the calls VIEW is not touched ──────────────────────────────────────
--
-- `public.calls` is `select * from field_calls union all …`, expanded to a
-- fixed column list when it was created — so it does not gain this column, and
-- Product History therefore reads the three BASE tables directly. That is not
-- a workaround, it is the point: re-creating that view is the single most
-- dangerous statement in this repository. `create or replace view` DROPS
-- `security_invoker`, and when 0057 re-created `calls` without re-asserting it,
-- every signed-in user could read every call. A performance file must not put
-- anybody in that position.
--
-- Reading the base tables loses nothing: 0040 put the RLS policies THERE
-- (`calls_scoped_read`, has_perm('calls.view') AND the visibility rule) and the
-- view only inherits them. A call somebody may not see through the register is
-- a call they do not see here either.
--
-- ── What it costs ──────────────────────────────────────────────────────────
--
-- A stored column of a few bytes a row and a partial btree on each of three
-- tables. `add column ... generated always as` REWRITES THE TABLE, so it takes
-- a brief exclusive lock and a moment on a large register — run it out of
-- hours. Nothing is dropped and no definition is replaced.
--
-- `if not exists` here guards a NAME that is not yet taken, which is the only
-- situation it is safe in. It does NOT compare the expression: if a column or
-- index of this name already exists with a different definition, this file
-- leaves it exactly as it is and says nothing. Check with the query at the
-- foot rather than assuming the run did what it reads as.
-- ===========================================================================

do $$
declare t text;
begin
  if to_regclass('public.field_calls') is null then
    raise notice 'ProdHistory_05: the call tables are not split (0040 has not run) — nothing to do.';
    return;
  end if;

  foreach t in array array['field_calls', 'installation_calls', 'pm_calls']
  loop
    -- The same expression `products.serial_key` uses (0129), so a serial keys
    -- the same way on both sides of a join and in both filters.
    execute format(
      'alter table public.%I add column if not exists serial_key text
         generated always as (lower(btrim(coalesce(serial, '''')))) stored', t);

    execute format(
      'create index if not exists %I on public.%I (serial_key) where serial_key <> ''''',
      t || '_serial_key_idx', t);

    execute format(
      'comment on column public.%I.serial_key is %L', t,
      'lower(btrim(serial)), stored, so one machine''s calls can be found as an EQUALITY through PostgREST. '
      'The inherited calls_serial_idx is an expression index and a client cannot reach it (see 0129).');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- `products` needs nothing: 0129 already gave it `serial_key`, and Product
-- History uses that one. `spare_consumption` needs nothing either: 0047 indexed
-- `ucn`, which is how the parts fitted are found. Both are named here so that
-- the next person does not add a second index for the same question — which is
-- how `products` ended up with three.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- CHECK IT LANDED, and that it is USED — the whole argument above is that an
-- index can exist and be ignored:
--
--   select table_name, column_name from information_schema.columns
--    where table_schema = 'public' and column_name = 'serial_key' order by 1;
--
--   explain (analyze, buffers)
--   select ucn from public.field_calls where serial_key = '<a real serial, lower-cased>';
--
-- "Index Scan using field_calls_serial_key_idx" is the answer you want. A Seq
-- Scan on a table Postgres considers small is the planner being right, and
-- needs nothing done about it.
-- ---------------------------------------------------------------------------
