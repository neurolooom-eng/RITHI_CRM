-- ===========================================================================
-- SYSTEM COLUMNS ON EVERY TABLE: sys_id, sys_created_by, sys_created_on,
-- sys_updated_by, sys_updated_on.
--
--   The user, 2026-09-26: "I need a key, Timestamp, sys_created_by,
--   sys_updated_by in all the tables" -- and then: "sys_created_by,
--   sys_created_on shouldn't overlap with any of the other fields". Their
--   answers to the four open questions:
--     * the key is a NEW sys_id on every table, not a business key;
--     * the author columns hold the LOGIN ID (auth.uid());
--     * rows that already exist are FILLED FROM EXISTING FIELDS;
--     * EVERY TABLE EXCEPT THE NUMBER COUNTERS.
--
-- "SHOULDN'T OVERLAP" IS THE DESIGN, and it is why none of these reuses a
-- column that already exists. `created_at`, `created_by`, `updated_at` and the
-- rest keep their BUSINESS meaning, which is not always "who wrote this row":
-- `field_calls.created_by` is the Hotline DESK a call is filed to (0114), and
-- `reports.updated_at` is the "Visit Entry Date" the Consumption Report prints.
-- The sys_* columns mean one thing on every table -- which login wrote the row,
-- and when -- and the DATABASE writes them:
--
--   sys_stamp() (a BEFORE INSERT OR UPDATE trigger, `zzz_sys_stamp`, named to
--   run LAST so every guard sees the row as the caller wrote it):
--     INSERT  -> a fresh sys_id; created_* and updated_* = this login, now().
--     UPDATE  -> sys_id and created_* kept from the old row; updated_* = this
--                login, now().
--   A SIGNED-IN CALLER CANNOT SET THEM. What the app sends is DISCARDED, not
--   refused -- the 0113/0114 rule: refusing makes an honest client fail (a row
--   read with select * and written back carries them), discarding makes a buggy
--   one harmless. Only a trusted role -- the SQL editor, a migration, a
--   SECURITY DEFINER function -- may supply a value, so a restore can put back
--   what it saved; left unsupplied, those are stamped too, from the real
--   caller's login (auth.uid() reads the session, not the definer).
--
-- THE ONE-TIME FILL, "FROM EXISTING FIELDS" -- same MEANING only, never a guess:
--     sys_created_on <- created_at
--     sys_created_by <- actual_created_by where the table has one (the three
--                       call tables: their created_by is the DESK, not the
--                       author, so it is deliberately NOT used), else
--                       created_by, else recorded_by -- uuid columns only
--     sys_updated_on <- updated_at
--     sys_updated_by <- updated_by
--   A table with no such field leaves that column blank, which means "not
--   recorded" -- nothing is invented. `spare_consumption.recorded_by` is a
--   typed NAME, not a login, so it is not used either.
--
-- HOW THE FILL IS DONE, because the obvious way is dangerous: an UPDATE over
-- every row would fire every guard, the audit trail, and -- on `reports` --
-- sync_call_last_visit(), which recomputes the status of every call. Instead
-- each column is ADDED as `generated always as (<source>) stored` and then
-- converted to a plain column with `drop expression`. That is a table rewrite,
-- which fires NO triggers, and it leaves exactly the values an UPDATE would
-- have written. One ALTER per table, so one rewrite per table.
--
-- NOT TOUCHED: the nine number-counter tables (their rows have no author);
-- `harness`, the test stand-in for Supabase's session; `schema_migrations`,
-- the auto-apply script's own ledger.
--
-- A TABLE ADDED LATER is covered by re-running this bundle: the loop at the end
-- attaches whatever is missing and leaves the rest alone. `_status.sql` row 187
-- names any table without the five columns and the trigger.
-- ===========================================================================

create or replace function public.sys_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- The API roles are the ones a client speaks as. Anything else -- postgres
  -- in the SQL editor, a migration, a SECURITY DEFINER function -- is trusted
  -- to supply a value (a restore putting back what it saved).
  trusted boolean := current_user not in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if not trusted then
      new.sys_id         := gen_random_uuid();
      new.sys_created_by := auth.uid();
      new.sys_created_on := now();
      new.sys_updated_by := auth.uid();
      new.sys_updated_on := now();
    else
      new.sys_id         := coalesce(new.sys_id, gen_random_uuid());
      new.sys_created_by := coalesce(new.sys_created_by, auth.uid());
      new.sys_created_on := coalesce(new.sys_created_on, now());
      new.sys_updated_by := coalesce(new.sys_updated_by, new.sys_created_by);
      new.sys_updated_on := coalesce(new.sys_updated_on, new.sys_created_on);
    end if;
    return new;
  end if;

  -- UPDATE
  if not trusted then
    new.sys_id         := old.sys_id;
    new.sys_created_by := old.sys_created_by;
    new.sys_created_on := old.sys_created_on;
    new.sys_updated_by := auth.uid();
    new.sys_updated_on := now();
  else
    -- A trusted statement that names a sys column keeps what it wrote (a
    -- repair); one that does not gets the stamp like anybody else.
    if new.sys_updated_on is not distinct from old.sys_updated_on then
      new.sys_updated_on := now();
    end if;
    if new.sys_updated_by is not distinct from old.sys_updated_by then
      new.sys_updated_by := auth.uid();
    end if;
  end if;
  return new;
end $$;

comment on function public.sys_stamp() is
  'Writes sys_id / sys_created_* / sys_updated_* on every insert and update (0244). A signed-in caller''s values are discarded; a trusted role may supply them.';

create or replace function public.sys_columns_attach(p_table regclass)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  rel  name := (select c.relname from pg_class c where c.oid = p_table);
  adds text[] := '{}';
  gens text[] := '{}';
  src  text;
begin
  -- sys_id: a key of its own on every row, filled for the rows already there
  -- by the column default during the rewrite.
  if not exists (select 1 from pg_attribute where attrelid = p_table and attname = 'sys_id' and not attisdropped) then
    adds := array_append(adds, 'add column sys_id uuid not null default gen_random_uuid()');
  end if;

  -- sys_created_by <- actual_created_by, else created_by, else recorded_by (uuid only)
  if not exists (select 1 from pg_attribute where attrelid = p_table and attname = 'sys_created_by' and not attisdropped) then
    select a.attname into src
      from pg_attribute a
     where a.attrelid = p_table and not a.attisdropped
       and a.attname in ('actual_created_by', 'created_by', 'recorded_by')
       and a.atttypid = 'uuid'::regtype
     order by array_position(array['actual_created_by', 'created_by', 'recorded_by']::name[], a.attname)
     limit 1;
    if src is not null then
      adds := array_append(adds, format('add column sys_created_by uuid generated always as (%I) stored', src));
      gens := array_append(gens, 'sys_created_by');
    else
      adds := array_append(adds, 'add column sys_created_by uuid');
    end if;
  end if;

  -- sys_created_on <- created_at
  src := null;
  if not exists (select 1 from pg_attribute where attrelid = p_table and attname = 'sys_created_on' and not attisdropped) then
    select a.attname into src from pg_attribute a
     where a.attrelid = p_table and not a.attisdropped
       and a.attname = 'created_at' and a.atttypid = 'timestamptz'::regtype;
    if src is not null then
      adds := array_append(adds, format('add column sys_created_on timestamptz generated always as (%I) stored', src));
      gens := array_append(gens, 'sys_created_on');
    else
      adds := array_append(adds, 'add column sys_created_on timestamptz');
    end if;
  end if;

  -- sys_updated_by <- updated_by
  src := null;
  if not exists (select 1 from pg_attribute where attrelid = p_table and attname = 'sys_updated_by' and not attisdropped) then
    select a.attname into src from pg_attribute a
     where a.attrelid = p_table and not a.attisdropped
       and a.attname = 'updated_by' and a.atttypid = 'uuid'::regtype;
    if src is not null then
      adds := array_append(adds, format('add column sys_updated_by uuid generated always as (%I) stored', src));
      gens := array_append(gens, 'sys_updated_by');
    else
      adds := array_append(adds, 'add column sys_updated_by uuid');
    end if;
  end if;

  -- sys_updated_on <- updated_at
  src := null;
  if not exists (select 1 from pg_attribute where attrelid = p_table and attname = 'sys_updated_on' and not attisdropped) then
    select a.attname into src from pg_attribute a
     where a.attrelid = p_table and not a.attisdropped
       and a.attname = 'updated_at' and a.atttypid = 'timestamptz'::regtype;
    if src is not null then
      adds := array_append(adds, format('add column sys_updated_on timestamptz generated always as (%I) stored', src));
      gens := array_append(gens, 'sys_updated_on');
    else
      adds := array_append(adds, 'add column sys_updated_on timestamptz');
    end if;
  end if;

  -- ONE ALTER, so ONE rewrite; then the generated columns become plain ones,
  -- keeping the values the rewrite computed.
  if array_length(adds, 1) > 0 then
    execute format('alter table %s %s', p_table, array_to_string(adds, ', '));
  end if;
  if array_length(gens, 1) > 0 then
    execute format('alter table %s %s', p_table,
      (select string_agg(format('alter column %I drop expression', g), ', ') from unnest(gens) g));
  end if;

  if to_regclass(format('public.%I', rel || '_sys_id_key')) is null then
    execute format('create unique index %I on %s (sys_id)', rel || '_sys_id_key', p_table);
  end if;

  -- Created only when missing: its definition never changes (the FUNCTION is
  -- what 'create or replace' above keeps current), and a drop-then-create
  -- prints a notice per table, which in the SQL editor reads as a problem.
  if not exists (select 1 from pg_trigger where tgrelid = p_table and tgname = 'zzz_sys_stamp') then
    execute format('create trigger zzz_sys_stamp before insert or update on %s for each row execute function public.sys_stamp()', p_table);
  end if;
end $$;

comment on function public.sys_columns_attach(regclass) is
  'Adds the five sys_* columns, their unique key and the stamping trigger to one table, filling existing rows from same-meaning fields (0244). Idempotent.';

-- DDL, for migrations only. Nobody signed in has any business calling it.
revoke all on function public.sys_columns_attach(regclass) from public;
do $$ begin
  execute 'revoke all on function public.sys_columns_attach(regclass) from anon, authenticated';
exception when undefined_object then null; end $$;

-- Every table in `public`, except the counters and the two tooling tables.
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname not in (
         -- the nine number counters: a row there has no author
         'call_number_seq', 'ffr_counters', 'indoor_job_counters',
         'material_return_counters', 'party_key_seq', 'spare_dispatch_counters',
         'spare_or_counters', 'stock_transfer_counters', 'ucn_counters',
         -- tooling, not application data
         'harness', 'schema_migrations')
     order by c.relname
  loop
    perform public.sys_columns_attach(r.t);
  end loop;
end $$;
