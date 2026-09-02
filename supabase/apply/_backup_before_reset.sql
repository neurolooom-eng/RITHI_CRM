-- ===========================================================================
-- SNAPSHOT BEFORE THE GO-LIVE RESET.
--
-- Copies every table `_reset_for_production.sql` empties into a `bak` schema in
-- the SAME project, so the reset can be undone with `_restore_from_backup.sql`.
--
-- ⚠️  This is NOT a substitute for a real backup. It lives inside the same
--     database, so it protects you against the RESET and nothing else — not a
--     dropped project, not a bad migration, not a region outage. Take a
--     `pg_dump` (or a Supabase Backups snapshot) as well if you can; this is
--     the fallback when all you have is the SQL editor.
--
--     The real backup, in order of preference:
--       a) Supabase Dashboard -> Database -> Backups. Paid plans keep daily
--          snapshots and Point-in-Time Recovery; on the free plan there are
--          none, so (b) is the only real backup you have.
--       b) A dump you keep off the platform. From the connection string in
--          Dashboard -> Project Settings -> Database:
--
--            pg_dump --no-owner --no-privileges \
--              -d "postgresql://postgres:<pw>@<host>:5432/postgres" \
--              -Fc -f rithi-preprod-$(date +%%F).dump
--
--          Restore with `pg_restore -d "<same url>" rithi-preprod-....dump`.
--          Check the file is a sensible size before you trust it.
--
-- To undo the reset from this snapshot, run `_restore_from_backup.sql`.
-- Once production data is in and you are happy, `drop schema bak cascade;`
-- clears the snapshot out.
--
-- Safe to read from: it only CREATES tables under `bak`, and refuses to run
-- twice into the same snapshot rather than overwriting one.
-- ===========================================================================

do $$
declare
  t    text;
  n    bigint;
  tabs text[] := array[
    -- section 1 of the reset — what the testing produced
    'field_calls','installation_calls','pm_calls','call_requests',
    'pending_registrations','call_reviews','reports','feedback',
    'spare_requests','spare_request_lines','spare_dispatches',
    'spare_dispatch_lines','spare_consumption','material_returns',
    'stock_transfers','stock_transfer_lines','notifications',
    -- section 2 — the registers and masters
    'parties','products','parts','masters',
    'sale_entries','sale_items','contract_entries','contract_items',
    -- section 3a — the numbering counters
    'call_number_seq','spare_or_counters','spare_dispatch_counters',
    'material_return_counters','stock_transfer_counters',
    -- section 4 — snapshot them too, whether or not you clear them
    'audit_log','record_audit','validation_results','kb_articles',
    'documents','help_screenshots'
  ];
begin
  create schema if not exists bak;

  for t in select unnest(tabs) loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipped %: not present in this project', t;
      continue;
    end if;
    if to_regclass('bak.' || t) is not null then
      raise exception 'bak.% already exists — a snapshot is already here. Rename or drop schema bak first, so an older snapshot is never silently overwritten.', t;
    end if;
    execute format('create table bak.%1$I as table public.%1$I', t);
    execute format('select count(*) from bak.%I', t) into n;
    raise notice '% -> bak.%  (% rows)', t, t, n;
  end loop;

  -- The three sequences TRUNCATE cannot reset are worth recording too, so a
  -- restore can put the series back exactly where it was.
  create table if not exists bak._sequences (name text primary key, last_value bigint, is_called boolean);
  insert into bak._sequences (name, last_value, is_called)
  select s, (select last_value from pg_sequences where schemaname='public' and sequencename=s),
            (select last_value is not null from pg_sequences where schemaname='public' and sequencename=s)
    from unnest(array['ucn_seq','call_req_seq','call_split_id_seq']) s
  on conflict (name) do nothing;

  create table if not exists bak._taken_at (at timestamptz primary key);
  insert into bak._taken_at values (now()) on conflict do nothing;
end $$;

-- What was captured.
select table_name, (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from bak.%I', table_name), false, true, '')))[1]::text::bigint as rows
  from information_schema.tables
 where table_schema = 'bak' and table_name not like '\_%'
 order by table_name;
