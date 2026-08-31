-- ===========================================================================
-- Split `calls` into three physical tables: field_calls, installation_calls,
-- pm_calls — so PM's bulk (15–18k/yr) lives in its own table and never bloats
-- the others. Non-breaking: `calls` becomes a UNION-ALL VIEW over the three,
-- with INSTEAD OF triggers routing every write to the right table, so all
-- existing code (addCall / updateCall / bulkInsert('calls') / the reports
-- last-visit sync / the pending_calls & call_state views) keeps working
-- unchanged. Stage 2 will point the registers at the typed tables directly.
--
-- There are NO foreign keys into calls (associations link by ucn/call_number
-- value only), so replacing the table with a view breaks no constraint.
--
-- Idempotent: the one-time structural split is guarded on field_calls not yet
-- existing; the views / triggers / policies are create-or-replace and re-run
-- safely.
-- ===========================================================================

-- Which physical table a call_type belongs to. Robust to 'P M VISIT' (spaces)
-- and 'INSTALLATION CALL'. Immutable so it can drive routing and checks.
create or replace function public.call_table_for(p_type text)
returns text language sql immutable set search_path = public as $$
  select case
    when upper(coalesce(p_type, '')) like 'INSTALL%'                     then 'installation'
    when upper(replace(coalesce(p_type, ''), ' ', '')) like 'PM%'        then 'pm'
    else 'field'
  end;
$$;

-- Fix next_ucn's PM detection to match (a 'P M VISIT' UCN should start with P).
create or replace function public.next_ucn(p_call_type text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  yy      text := to_char(now(), 'YY');
  mon     text := substr('ABCDEFGHIJKL', extract(month from now())::int, 1);
  dd      text := to_char(now(), 'DD');
  tletter text := case public.call_table_for(p_call_type)
                    when 'installation' then 'I'
                    when 'pm'           then 'P'
                    else 'F'
                  end;
  seq     int  := nextval('public.ucn_seq');
begin
  return yy || mon || dd || tletter || lpad(seq::text, 4, '0');
end;
$$;

-- ---- one-time structural split --------------------------------------------
do $$
declare cols text;
begin
  if to_regclass('public.field_calls') is not null then return; end if;      -- already split

  -- A single id space shared across the three tables, so the union view's id
  -- stays unique. Continue past the highest existing id.
  create sequence if not exists public.call_split_id_seq;
  perform setval('public.call_split_id_seq', coalesce((select max(id) from public.calls), 0) + 1, false);

  -- Three tables cloned from the current calls shape (columns, the generated
  -- open_state, defaults, the ucn-unique and allocated/serial/open indexes).
  create table public.field_calls        (like public.calls including all);
  create table public.installation_calls (like public.calls including all);
  create table public.pm_calls           (like public.calls including all);

  -- id: drop the per-table identity LIKE copied, use the shared sequence.
  alter table public.field_calls        alter column id drop identity if exists, alter column id set default nextval('public.call_split_id_seq');
  alter table public.installation_calls alter column id drop identity if exists, alter column id set default nextval('public.call_split_id_seq');
  alter table public.pm_calls           alter column id drop identity if exists, alter column id set default nextval('public.call_split_id_seq');

  -- created_by FK parity (LIKE never copies foreign keys).
  alter table public.field_calls        add constraint field_calls_created_by_fkey        foreign key (created_by) references auth.users(id);
  alter table public.installation_calls add constraint installation_calls_created_by_fkey foreign key (created_by) references auth.users(id);
  alter table public.pm_calls           add constraint pm_calls_created_by_fkey           foreign key (created_by) references auth.users(id);

  -- Copy existing rows into their table by type. All non-generated columns
  -- (this list excludes the generated open_state, which recomputes itself).
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'calls' and is_generated = 'NEVER';

  execute format('insert into public.field_calls (%1$s)        select %1$s from public.calls where public.call_table_for(call_type) = %2$L', cols, 'field');
  execute format('insert into public.installation_calls (%1$s) select %1$s from public.calls where public.call_table_for(call_type) = %2$L', cols, 'installation');
  execute format('insert into public.pm_calls (%1$s)           select %1$s from public.calls where public.call_table_for(call_type) = %2$L', cols, 'pm');

  -- Drop the views and the reports policy that depend on the table, then the
  -- table itself (this also drops its calls_biu trigger and its RLS policies).
  drop view if exists public.pending_calls;
  drop view if exists public.call_state;
  drop policy if exists reports_read on public.reports;   -- references public.calls; recreated below over the view
  drop table public.calls;
end $$;

-- ---- per-table write trigger (ucn / call_number / reg_date / created_by) ---
-- calls_before_insert() already exists (0015); attach it to each base table.
drop trigger if exists calls_biu on public.field_calls;
create trigger calls_biu before insert on public.field_calls        for each row execute function public.calls_before_insert();
drop trigger if exists calls_biu on public.installation_calls;
create trigger calls_biu before insert on public.installation_calls for each row execute function public.calls_before_insert();
drop trigger if exists calls_biu on public.pm_calls;
create trigger calls_biu before insert on public.pm_calls           for each row execute function public.calls_before_insert();

-- ---- the compatibility view ------------------------------------------------
create or replace view public.calls as
  select * from public.field_calls
  union all select * from public.installation_calls
  union all select * from public.pm_calls;
alter view public.calls set (security_invoker = on);
grant select, insert, update, delete on public.calls to authenticated;
grant select, insert, update, delete on public.field_calls, public.installation_calls, public.pm_calls to authenticated;
grant usage on sequence public.call_split_id_seq to authenticated;   -- id default is nextval(); insert needs it

-- INSTEAD OF triggers route writes and (on insert) write the trigger-assigned
-- ucn / call_number / id / open_state back onto NEW so `insert … returning *`
-- gives the caller the real UCN.
do $$
declare ins_cols text; ins_vals text; set_list text;
begin
  -- INSERT omits id (shared-sequence default). For every other column, fall
  -- back to the base-table default when the caller didn't supply it, so an
  -- omitted column (NEW is null on a view insert) still gets '' / '{}' / now()
  -- / 'Registered' rather than a null that breaks NOT NULL or loses the default.
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
            returning id, ucn, call_number, reg_date, created_by, open_state
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state;
        when 'pm' then
          insert into public.pm_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, open_state
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state;
        else
          insert into public.field_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, open_state
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.open_state;
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
end $$;

create or replace function public.calls_view_delete() returns trigger language plpgsql as $$
begin
  case public.call_table_for(old.call_type)
    when 'installation' then delete from public.installation_calls where ucn = old.ucn;
    when 'pm'           then delete from public.pm_calls           where ucn = old.ucn;
    else                     delete from public.field_calls        where ucn = old.ucn;
  end case;
  return old;
end $$;

drop trigger if exists calls_view_ins on public.calls;
create trigger calls_view_ins instead of insert on public.calls for each row execute function public.calls_view_insert();
drop trigger if exists calls_view_upd on public.calls;
create trigger calls_view_upd instead of update on public.calls for each row execute function public.calls_view_update();
drop trigger if exists calls_view_del on public.calls;
create trigger calls_view_del instead of delete on public.calls for each row execute function public.calls_view_delete();

-- ---- the last-visit sync now targets the base tables -----------------------
create or replace function public.sync_call_last_visit(p_ucn text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_at timestamptz;
begin
  select call_status, visit_at into v_status, v_at
    from public.reports where ucn = p_ucn
   order by updated_at desc nulls last, id desc limit 1;   -- null when no visits → Unattended
  update public.field_calls        set last_status = coalesce(v_status, ''), last_visit_at = v_at where ucn = p_ucn;
  update public.installation_calls set last_status = coalesce(v_status, ''), last_visit_at = v_at where ucn = p_ucn;
  update public.pm_calls           set last_status = coalesce(v_status, ''), last_visit_at = v_at where ucn = p_ucn;
end $$;

-- ---- rebuild the derived views over the union ------------------------------
create or replace view public.call_state as
  select ucn, last_status, last_visit_at, open_state as state from public.calls;
create or replace view public.pending_calls as
  select * from public.calls where open_state <> 'Solved';
alter view public.call_state    set (security_invoker = on);
alter view public.pending_calls set (security_invoker = on);
grant select on public.call_state, public.pending_calls to authenticated;

-- reports_read reads calls (now the view) to scope a visit by its parent call.
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select
  using (
    (select public.is_admin())
    or (
      (select public.has_perm('calls.view'))
      and (
        (select public.can_view_all_calls())
        or exists (
          select 1 from public.calls c
           where c.ucn = reports.ucn
             and (
               coalesce(c.allocated_to, '') = ''
               or lower(trim(c.allocated_to)) in (
                    select lower(trim(n)) from public.visible_engineer_names() as v(n))
             )
        )
      )
    )
  );

-- ---- RLS: the same three policies (0037 read/update, rbac insert) per table -
do $$
declare t text; vis text;
begin
  -- The shared "may I see this call" test, inlined so the reporting-tree set is
  -- an InitPlan built once (the 0037 shape).
  vis := $v$ (select public.can_view_all_calls())
             or created_by = (select auth.uid())
             or coalesce(allocated_to, '') = ''
             or lower(trim(allocated_to)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)) $v$;
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists calls_scoped_read on public.%I', t);
    execute format('create policy calls_scoped_read on public.%I for select using ((select public.has_perm(''calls.view'')) and (%s))', t, vis);
    execute format('drop policy if exists calls_insert on public.%I', t);
    execute format('create policy calls_insert on public.%I for insert with check (public.has_perm(''calls.create''))', t);
    execute format('drop policy if exists calls_update on public.%I', t);
    execute format('create policy calls_update on public.%1$I for update using ((select (public.has_perm(''calls.edit'') or public.has_perm(''calls.report''))) and (%2$s)) with check ((select (public.has_perm(''calls.edit'') or public.has_perm(''calls.report''))) and (%2$s))', t, vis);
  end loop;
end $$;
