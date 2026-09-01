-- ===========================================================================
-- PM schedule fields. PM calls are raised for a due MONTH: the registration
-- DATE is the 1st of that month (so a January batch is dated 1 Jan, whether
-- uploaded in January or backfilled later), and the actual upload date is kept
-- separately as "added_on".
--
-- The call NUMBERING is unchanged (UCN + Call Number as before). What gives a
-- monthly batch a stable order is the registration DATE-AND-TIME: a new
-- `reg_at timestamptz` alongside `reg_date`. The uploader sequences a batch a
-- few seconds apart (see pmImport.ts) — for a fresh month from 00:30 on the
-- 1st, or continuing after the latest existing call when adding to a month that
-- already has some — and the datetime is editable before import.
--
-- reg_date stays a plain `date` (every existing view/index/interval that reads
-- it keeps working); reg_at is the finer-grained companion. Two columns are
-- added to the split call tables, so the calls view and the INSTEAD OF routing
-- triggers are rebuilt to carry them.
-- ===========================================================================

-- An earlier revision of this file trialled a per-month serial (PM-YYYY-MM-####);
-- that idea was dropped (numbering must not change). Remove its objects if a
-- previous bundle created them — harmless if they were never there.
drop trigger  if exists pm_serial_biu on public.pm_calls;
drop function if exists public.pm_serial_assign();
drop function if exists public.next_pm_serial(date);
drop table    if exists public.pm_serial_seq;

do $outer$
begin
  if to_regclass('public.field_calls') is null then
    raise notice 'calls not split yet (0040) — run split_call_tables.sql first';
    return;
  end if;

  -- 1. new columns on each base table (identical shape for the UNION view).
  --    added_on: the day the batch was uploaded. reg_at: the registration
  --    date-and-time (reg_date is its date part).
  alter table public.field_calls        add column if not exists added_on date, add column if not exists reg_at timestamptz;
  alter table public.installation_calls add column if not exists added_on date, add column if not exists reg_at timestamptz;
  alter table public.pm_calls           add column if not exists added_on date, add column if not exists reg_at timestamptz;
  -- The uploader reads the latest reg_at for a due-month to continue after it.
  create index if not exists pm_calls_reg_idx on public.pm_calls (reg_date, reg_at desc);

  -- 2. back-fill reg_at for existing rows so the column is never null where a
  --    date is known (midnight of the registration date).
  update public.field_calls        set reg_at = reg_date::timestamptz where reg_at is null and reg_date is not null;
  update public.installation_calls set reg_at = reg_date::timestamptz where reg_at is null and reg_date is not null;
  update public.pm_calls           set reg_at = reg_date::timestamptz where reg_at is null and reg_date is not null;

  -- 3. the calls view and pending_calls gain the columns (CREATE OR REPLACE
  --    appends the new select-* columns; call_state is unchanged).
  create or replace view public.calls as
    select * from public.field_calls
    union all select * from public.installation_calls
    union all select * from public.pm_calls;
  alter view public.calls set (security_invoker = on);
  create or replace view public.pending_calls as
    select * from public.calls where open_state <> 'Solved';
end $outer$;

-- Keep reg_date and reg_at consistent when only one is supplied: derive the
-- date from the datetime, and default the datetime to midnight of the date.
-- (calls_before_insert() from 0015 also assigns the UCN / Call Number.)
-- Only rebuilt on a SPLIT project — on the pre-split `calls` table there is no
-- reg_at column, so referencing it would break inserts; there we leave the
-- 0015/0040 version in place and this whole migration is a no-op until the
-- split (0040) has run.
do $cbi$
begin
  if to_regclass('public.field_calls') is null then return; end if;
  execute $fn$
    create or replace function public.calls_before_insert()
    returns trigger language plpgsql security definer set search_path = public as $body$
    begin
      if new.ucn is null or new.ucn = '' then
        new.ucn := public.next_ucn(new.call_type);
      end if;
      if new.reg_date is null and new.reg_at is not null then
        new.reg_date := new.reg_at::date;
      end if;
      if coalesce(new.call_number, '') = '' then
        new.call_number := public.next_direct_call_number(to_char(coalesce(new.reg_date, current_date), 'YY'));
      end if;
      if new.reg_date is null then new.reg_date := current_date; end if;
      if new.reg_at is null then new.reg_at := new.reg_date::timestamptz; end if;
      if new.created_by is null then new.created_by := auth.uid(); end if;
      return new;
    end $body$;
  $fn$;
end $cbi$;

-- 4. Rebuild the INSTEAD OF insert/update trigger functions so the two new
--    columns are routed, and returned (both supplied by the caller) on
--    `insert … returning *`.
do $regen$
declare ins_cols text; ins_vals text; set_list text;
begin
  if to_regclass('public.field_calls') is null then return; end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(
           case when column_default is not null
                then format('coalesce(new.%I, %s)', column_name, column_default)
                else 'new.' || quote_ident(column_name) end,
           ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = new.' || quote_ident(column_name), ', ' order by ordinal_position)
    into ins_cols, ins_vals, set_list
    from information_schema.columns
   where table_schema = 'public' and table_name = 'field_calls'
     and is_generated = 'NEVER' and column_name <> 'id';

  execute format($f$
    create or replace function public.calls_view_insert() returns trigger language plpgsql as $b$
    begin
      case public.call_table_for(new.call_type)
        when 'installation' then
          insert into public.installation_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state, new.added_on, new.reg_at;
        when 'pm' then
          insert into public.pm_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state, new.added_on, new.reg_at;
        else
          insert into public.field_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state, new.added_on, new.reg_at;
      end case;
      return new;
    end $b$;
  $f$, ins_cols, ins_vals);

  execute format($f$
    create or replace function public.calls_view_update() returns trigger language plpgsql as $b$
    begin
      case public.call_table_for(old.call_type)
        when 'installation' then update public.installation_calls set %1$s where ucn = old.ucn;
        when 'pm'           then update public.pm_calls           set %1$s where ucn = old.ucn;
        else                     update public.field_calls        set %1$s where ucn = old.ucn;
      end case;
      return new;
    end $b$;
  $f$, set_list);
end $regen$;
