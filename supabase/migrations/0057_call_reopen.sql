-- ===========================================================================
-- Re-opening a closed call.
--
-- A call whose latest visit says Solved is finished: no more visit entries,
-- spare requests or edits. Sometimes it isn't really finished — the fault
-- returns, or the visit was entered against the wrong call — so the Hotline
-- can RE-OPEN it. A re-opened call counts as open again and carries a flag
-- (`reopen_count`) that makes "how many calls were re-opened?" a filter rather
-- than an archaeology exercise.
--
-- `open_state` itself is left alone: it is a generated column with views
-- hanging off it (field_call_review …), and re-opening is a fact ABOUT the
-- call, not another visit outcome. The effective state — open_state, or
-- 'Reopened' while a re-open is outstanding — is exposed by `call_state` and
-- `pending_calls`, which is what the registers read.
--
-- A re-open is spent by the next visit entry: once visited again the call's
-- state comes from that visit, as usual.
-- ===========================================================================

do $reopen$
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
    execute format('alter table public.%I add column if not exists reopened_at timestamptz', t);
    execute format('alter table public.%I add column if not exists reopen_count integer not null default 0', t);
    execute format('create index if not exists %I on public.%I (reopen_count) where reopen_count > 0',
                   t || '_reopen_idx', t);
  end loop;

  -- A view built with select * fixed its column list when it was created, so
  -- it has to be replaced to carry the two new columns. Replacing (rather than
  -- dropping) keeps the INSTEAD OF triggers attached.
  if to_regclass('public.field_calls') is not null then
    create or replace view public.calls as
      select * from public.field_calls
      union all select * from public.installation_calls
      union all select * from public.pm_calls;
  end if;
end $reopen$;

-- The view's INSTEAD OF functions were generated from the column list as it
-- was; regenerate so a write through `calls` carries the new columns too.
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

-- ---- a visit entry spends the re-open --------------------------------------
create or replace function public.sync_call_last_visit(p_ucn text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.calls c
     set last_status   = coalesce(r.call_status, ''),
         last_visit_at = r.visit_at,
         reopened_at   = null
    from (
      select call_status, visit_at
        from public.reports
       where ucn = p_ucn
       order by updated_at desc nulls last, id desc
       limit 1
    ) r
   where c.ucn = p_ucn;

  if not found then  -- no visits left (or none matched): back to Unattended
    update public.calls set last_status = '', last_visit_at = null where ucn = p_ucn;
  end if;
end $$;

-- ---- re-open ---------------------------------------------------------------
-- The Hotline (pending.register) or anyone who may create calls. Security
-- definer so the re-open lands even where the caller may not write the row.
create or replace function public.reopen_call(p_ucn text, p_reason text default '')
returns text language plpgsql security definer set search_path = public as $$
declare v_solved boolean; v_reopened timestamptz;
begin
  if not (public.has_perm('pending.register') or public.has_perm('calls.create')) then
    raise exception 'RBAC: your role cannot re-open a call';
  end if;

  select open_state = 'Solved', reopened_at into v_solved, v_reopened
    from public.calls where ucn = p_ucn;
  if v_solved is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_reopened is not null then raise exception 'Call % is already re-opened', p_ucn; end if;
  if not v_solved then raise exception 'Call % is not closed, so there is nothing to re-open', p_ucn; end if;

  update public.calls
     set reopened_at = now(), reopen_count = coalesce(reopen_count, 0) + 1
   where ucn = p_ucn;

  return p_ucn;
end $$;
grant execute on function public.reopen_call(text, text) to authenticated;

-- ---- views: effective state, re-open included ------------------------------
drop view if exists public.pending_calls;
drop view if exists public.call_state;

create view public.call_state as
  select ucn, last_status, last_visit_at, reopened_at, reopen_count,
         case when reopened_at is not null then 'Reopened' else open_state end as state
    from public.calls;

create view public.pending_calls as
  select * from public.calls where open_state <> 'Solved' or reopened_at is not null;

alter view public.call_state    set (security_invoker = on);
alter view public.pending_calls set (security_invoker = on);

grant select on public.call_state    to authenticated;
grant select on public.pending_calls to authenticated;
