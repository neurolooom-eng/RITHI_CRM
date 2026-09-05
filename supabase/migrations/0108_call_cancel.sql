-- ===========================================================================
-- CANCELLING A CALL.
--
-- A registered call sometimes should not exist: the same fault was raised
-- twice, the customer rang back, it went onto the wrong machine. Until now the
-- only way out was to leave it open for ever or to close it as though somebody
-- had solved something — which puts a fiction into the register and into every
-- count taken from it.
--
-- WHO. Admin, NSM and the Hotline Engineer, by the user's decision
-- (2026-09-05). It is one permission, `calls.cancel`, so an administrator can
-- give it to somebody else or take it away without a migration. It covers Field,
-- PM and Installation calls alike: they are three tables and one register, and
-- a call raised in error is the same mistake whichever it is.
--
-- NOT A DELETE. The row stays, with who cancelled it, when, and why. The call
-- keeps its UCN, its visits and its quality records — 0049 forbids deleting
-- those and this must not smuggle a delete in through the side door. It leaves
-- the OPEN list and reads as Cancelled everywhere else.
--
-- REVERSIBLE. `restore_call` puts it back, because a one-way action with no
-- undo and a whole register to aim it at is a bad thing to hand anybody. The
-- restore is the same permission and leaves the reason behind it in place.
--
-- WHY NOT `open_state`. That is a STORED GENERATED column on all three tables,
-- and changing its expression means rebuilding the column and everything built
-- on it. Cancellation is not a state the visits derive; it is something a
-- person did to the call. So it is its own columns, and only the VIEWS decide
-- what to show — which is cheap and reversible.
-- ===========================================================================

do $cancel$
declare
  t      text;
  tables text[] := case when to_regclass('public.field_calls') is not null
                        then array['field_calls', 'installation_calls', 'pm_calls']
                        else array['calls'] end;
begin
  if to_regclass('public.field_calls') is null
     and (select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'calls') <> 'r' then
    raise notice 'calls is neither a table nor split — nothing to alter';
    return;
  end if;

  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists cancelled_at timestamptz', t);
    execute format('alter table public.%I add column if not exists cancel_reason text not null default %L', t, '');
    execute format('alter table public.%I add column if not exists cancelled_by uuid', t);
    -- Partial: cancelled calls are the rare ones, and every list that cares
    -- asks for "not cancelled" or "cancelled only".
    execute format('create index if not exists %I on public.%I (cancelled_at) where cancelled_at is not null',
                   t || '_cancelled_idx', t);
  end loop;

  -- `select *` fixed the column list when the view was created, so it has to be
  -- replaced to carry the three new ones. REPLACED, not dropped: the INSTEAD OF
  -- triggers and the KPI views built on it stay attached.
  if to_regclass('public.field_calls') is not null then
    create or replace view public.calls as
      select * from public.field_calls
      union all select * from public.installation_calls
      union all select * from public.pm_calls;
  end if;
end $cancel$;

-- `create or replace view` DROPS security_invoker, and a view without it reads
-- as its OWNER — every signed-in user seeing every call, with no error. 0057
-- rebuilt this view and left it off; 0105 is what put it back. Re-asserted here
-- because this migration rebuilds it again.
alter view public.calls set (security_invoker = on);

-- The INSTEAD OF functions were generated from the column list as it was;
-- regenerate so a write through `calls` carries the new columns too.
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

-- ---- the state a reader sees ----------------------------------------------
-- Cancelled is tested FIRST: a call cancelled while it was re-opened is
-- cancelled, not re-opened, and a cancelled call is not "Unattended" waiting
-- for somebody to go.
create or replace view public.call_state as
  select ucn, last_status, last_visit_at, reopened_at, reopen_count,
         case when cancelled_at is not null then 'Cancelled'
              when reopened_at is not null  then 'Reopened'
              else open_state end as state
    from public.calls;

-- A cancelled call is not pending: nobody is expected to go to it.
create or replace view public.pending_calls as
  select * from public.calls
   where cancelled_at is null
     and (open_state <> 'Solved' or reopened_at is not null);

alter view public.call_state    set (security_invoker = on);
alter view public.pending_calls set (security_invoker = on);

-- ---- cancel / restore ------------------------------------------------------
-- SECURITY DEFINER so the change lands on the physical table even where the
-- caller's update policy would not reach it — the permission is the gate, and
-- it is checked first and explicitly.
create or replace function public.cancel_call(p_ucn text, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cancelled timestamptz; v_exists boolean;
begin
  if not public.has_perm('calls.cancel') then
    raise exception 'RBAC: your role cannot cancel a call';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A cancellation needs a reason';
  end if;

  select true, cancelled_at into v_exists, v_cancelled
    from public.calls where ucn = p_ucn;
  if v_exists is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_cancelled is not null then raise exception 'Call % is already cancelled', p_ucn; end if;

  update public.calls
     set cancelled_at  = now(),
         cancel_reason = btrim(p_reason),
         cancelled_by  = auth.uid()
   where ucn = p_ucn;

  return p_ucn;
end $$;
revoke all on function public.cancel_call(text, text) from public;
grant execute on function public.cancel_call(text, text) to authenticated;

-- The undo. The reason stays on the row: what was done and then undone is part
-- of the record, and clearing it would hide that this happened at all.
create or replace function public.restore_call(p_ucn text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cancelled timestamptz; v_exists boolean;
begin
  if not public.has_perm('calls.cancel') then
    raise exception 'RBAC: your role cannot restore a call';
  end if;

  select true, cancelled_at into v_exists, v_cancelled
    from public.calls where ucn = p_ucn;
  if v_exists is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_cancelled is null then raise exception 'Call % is not cancelled', p_ucn; end if;

  update public.calls set cancelled_at = null, cancelled_by = null where ucn = p_ucn;
  return p_ucn;
end $$;
revoke all on function public.restore_call(text) from public;
grant execute on function public.restore_call(text) to authenticated;

-- ---- who may do it ---------------------------------------------------------
-- MERGED into whatever these roles already carry: an administrator may have
-- tuned them, and overwriting would silently take something away.
do $grant$
declare r text;
begin
  foreach r in array array['admin', 'nsm', 'hotline'] loop
    insert into public.app_roles as ar (role, label, permissions)
    values (r, initcap(replace(r, '_', ' ')), '["calls.cancel"]'::jsonb)
    on conflict (role) do update set
      permissions = (
        select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
        from (
          select jsonb_array_elements_text(ar.permissions) as v
          union
          select 'calls.cancel' as v
        ) u
      ),
      updated_at = now();
  end loop;
end $grant$;
