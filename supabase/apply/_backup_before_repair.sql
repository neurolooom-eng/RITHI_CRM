-- ===========================================================================
-- TAKE A SNAPSHOT BEFORE REPAIRING ANYTHING.
--
-- The user, 2026-09-21: "Take a back up." Paste the whole file into the
-- Supabase SQL editor. It prints a manifest when it is done.
--
-- WHAT THIS IS, AND WHAT IT IS NOT. It copies eight tables into a schema
-- called `backup_before_repair` INSIDE THE SAME DATABASE. That protects you
-- against a repair that writes the wrong thing -- which is the risk in front
-- of us -- and against nothing else. It is not a backup of the project: if the
-- project is lost, this goes with it.
--
--   THE REAL BACKUP IS SUPABASE'S OWN, and it is one click:
--   Dashboard -> Database -> Backups. Take one there as well, and note the
--   time. Point-in-time restore is the only thing that can undo a mistake this
--   snapshot did not anticipate -- and its window EXPIRES, which is how the
--   4,222 calls became unrecoverable.
--
-- IT REFUSES TO OVERWRITE. If `backup_before_repair` already exists this does
-- nothing and reports what is in it, so a second run cannot quietly replace a
-- good snapshot with a damaged one taken after the fact. To take a fresh one,
-- rename the old schema first:
--   alter schema backup_before_repair rename to backup_before_repair_1;
--
-- Copies are plain tables: no triggers, no policies, no constraints. That is
-- deliberate -- a snapshot is evidence, not a working copy, and the retention
-- guard on the originals must not make the copies undeletable.
-- ===========================================================================

do $backup$
declare
  t text;
  n bigint;
  tables text[] := array[
    -- everything the repairs in this session can write to
    'reports', 'field_calls', 'installation_calls', 'pm_calls',
    'feedback', 'call_reviews', 'sale_items', 'contract_items'
  ];
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'backup_before_repair') then
    raise notice 'backup_before_repair already exists -- NOTHING was copied. Rename it first if you want a fresh snapshot.';
    return;
  end if;

  execute 'create schema backup_before_repair';
  execute 'create table backup_before_repair.manifest ('
        || ' table_name text primary key, rows bigint, taken_at timestamptz not null default now())';

  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      execute format('insert into backup_before_repair.manifest (table_name, rows) values (%L, -1)', t);
      continue;
    end if;
    execute format('create table backup_before_repair.%I as select * from public.%I', t, t);
    execute format('select count(*) from backup_before_repair.%I', t) into n;
    execute format('insert into backup_before_repair.manifest (table_name, rows) values (%L, %s)', t, n);
  end loop;
end $backup$;

-- The manifest. `create table as select *` copies whatever was there at that
-- moment, so `rows_copied` IS the live count at the time of the snapshot; a
-- second count taken now would only tell you what has changed since.
-- A table that does not exist on this project is recorded as -1 rather than
-- omitted, so a missing one reads as an answer instead of a gap.
select m.table_name, m.rows as rows_copied, m.taken_at
  from backup_before_repair.manifest m
 order by m.table_name;

-- TO PUT ONE TABLE BACK (only if a repair went wrong, and read it first):
--   begin;
--   delete from public.sale_items where uid in (select uid from backup_before_repair.sale_items);
--   insert into public.sale_items select * from backup_before_repair.sale_items;
--   commit;
-- `reports`, the call tables and `feedback` carry the retention guard, which
-- refuses a delete from the app but not from this editor -- so a restore here
-- works and is recorded. Do it inside a transaction, one table at a time.
