-- ===========================================================================
-- Database-enforced audit trail. The client-side audit_log records user actions,
-- but a defensible Part 11 / QMS audit trail must be created by the database so
-- it cannot be bypassed or altered. record_audit captures every INSERT / UPDATE
-- / DELETE on the quality-record tables, with the acting user, timestamp and the
-- before/after row. It is written only by SECURITY DEFINER triggers, read only
-- by admins, and never updatable/deletable by users.
-- ===========================================================================

create table if not exists public.record_audit (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  op          text not null,           -- INSERT | UPDATE | DELETE
  record_key  text,                    -- ucn / uid / call_number / id
  actor       uuid,
  actor_email text,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);
create index if not exists record_audit_at_idx  on public.record_audit (changed_at desc);
create index if not exists record_audit_tbl_idx on public.record_audit (table_name, changed_at desc);
create index if not exists record_audit_key_idx on public.record_audit (record_key);

create or replace function public.record_audit_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  if tg_op = 'DELETE' then j := to_jsonb(old); else j := to_jsonb(new); end if;
  insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
  values (
    tg_table_name, tg_op,
    coalesce(j->>'ucn', j->>'uid', j->>'line_uid', j->>'call_number', j->>'id'),
    auth.uid(), auth.email(),
    case when tg_op <> 'INSERT' then to_jsonb(old) else null end,
    case when tg_op <> 'DELETE' then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

alter table public.record_audit enable row level security;
grant select on public.record_audit to authenticated;   -- read only; no insert/update/delete grant
drop policy if exists record_audit_read on public.record_audit;
create policy record_audit_read on public.record_audit for select
  using (public.is_admin() or public.has_perm('audit.view'));

-- Attach to the quality-record tables that exist.
do $$
declare t text;
begin
  foreach t in array array[
    'field_calls', 'installation_calls', 'pm_calls', 'reports',
    'spare_requests', 'spare_request_lines', 'spare_consumption', 'feedback',
    'call_requests', 'pending_registrations'
  ] loop
    if to_regclass('public.' || t) is not null
       and (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'r' then
      execute format('drop trigger if exists record_audit_t on public.%I', t);
      execute format('create trigger record_audit_t after insert or update or delete on public.%I for each row execute function public.record_audit_fn()', t);
    end if;
  end loop;
end $$;
