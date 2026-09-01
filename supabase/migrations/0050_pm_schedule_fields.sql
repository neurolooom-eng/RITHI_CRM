-- ===========================================================================
-- PM schedule fields. PM calls are raised for a due MONTH: the registration
-- date is the 1st of that month (so a January batch is dated 1 Jan, whether
-- uploaded in January or backfilled later), and the actual upload date is kept
-- separately as "added_on". Each PM call also gets a per-month serial that
-- continues within its due-month — PM-YYYY-MM-#### (Jan's 501st call is
-- PM-2026-01-0501). The UCN and Call Number are still assigned as before.
--
-- This adds two columns to the split call tables, so the calls view and the
-- INSTEAD OF routing triggers are rebuilt to carry them.
-- ===========================================================================

do $outer$
begin
  if to_regclass('public.field_calls') is null then
    raise notice 'calls not split yet (0040) — run split_call_tables.sql first';
    return;
  end if;

  -- 1. new columns on each base table (identical shape for the UNION view).
  alter table public.field_calls        add column if not exists added_on date, add column if not exists pm_serial text;
  alter table public.installation_calls add column if not exists added_on date, add column if not exists pm_serial text;
  alter table public.pm_calls           add column if not exists added_on date, add column if not exists pm_serial text;
  create index if not exists pm_calls_pm_serial_idx on public.pm_calls (pm_serial);

  -- 2. per-month PM serial counter (only the definer function touches it).
  create table if not exists public.pm_serial_seq (ym text primary key, last_no integer not null default 0);
  alter table public.pm_serial_seq enable row level security;

  -- 3. the calls view and pending_calls gain the columns (CREATE OR REPLACE
  --    appends the new select-* columns; call_state is unchanged).
  create or replace view public.calls as
    select * from public.field_calls
    union all select * from public.installation_calls
    union all select * from public.pm_calls;
  create or replace view public.pending_calls as
    select * from public.calls where open_state <> 'Solved';
end $outer$;

-- Per-month serial: continues within the due-month (seeded from what's there).
create or replace function public.next_pm_serial(p_reg date)
returns text language plpgsql security definer set search_path = public as $$
declare v_ym text := to_char(coalesce(p_reg, current_date), 'YYYY-MM'); v_no integer;
begin
  insert into public.pm_serial_seq (ym, last_no)
  values (v_ym, coalesce((select max(substring(pm_serial from 12 for 4)::int)
                            from public.pm_calls where pm_serial like 'PM-' || v_ym || '-%'), 0))
  on conflict (ym) do nothing;
  update public.pm_serial_seq set last_no = last_no + 1 where ym = v_ym returning last_no into v_no;
  return 'PM-' || v_ym || '-' || lpad(v_no::text, 4, '0');
end $$;

-- Assign it on insert of a PM call (fires after calls_biu, which sets reg_date).
create or replace function public.pm_serial_assign()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.pm_serial, '') = '' then new.pm_serial := public.next_pm_serial(new.reg_date); end if;
  return new;
end $$;
drop trigger if exists pm_serial_biu on public.pm_calls;
create trigger pm_serial_biu before insert on public.pm_calls
  for each row execute function public.pm_serial_assign();

-- 4. Rebuild the INSTEAD OF insert/update trigger functions so the two new
--    columns are routed, and returned (added_on supplied by the caller,
--    pm_serial assigned by the trigger above) on `insert … returning *`.
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
            returning id, ucn, call_number, reg_date, created_by, open_state, added_on, pm_serial
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state, new.added_on, new.pm_serial;
        when 'pm' then
          insert into public.pm_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, open_state, added_on, pm_serial
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state, new.added_on, new.pm_serial;
        else
          insert into public.field_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, open_state, added_on, pm_serial
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state, new.added_on, new.pm_serial;
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
