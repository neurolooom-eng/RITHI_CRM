-- ===========================================================================
-- Record-retention guard. Quality records must be retained, not deleted — an
-- auditor expects that a service record, visit report or spare request cannot
-- be removed. Hard DELETE on these append-only quality tables is blocked; the
-- app uses status / cancel / drop workflows instead, which are captured by the
-- audit trail. (Configuration/operational tables are not covered here.)
-- ===========================================================================

create or replace function public.block_hard_delete()
returns trigger language plpgsql as $$
begin
  -- Application deletion (the authenticated role, via PostgREST) is blocked for
  -- retention. Controlled deletion by a DBA/superuser (e.g. an approved archival
  -- procedure in the SQL editor) is permitted and is still captured by the
  -- database audit trail.
  if current_user = 'authenticated' then
    raise exception
      'RECORD RETENTION: % records cannot be deleted (row %). Use the defined status / cancel / drop workflow.',
      tg_table_name,
      coalesce(to_jsonb(old)->>'ucn', to_jsonb(old)->>'uid', to_jsonb(old)->>'call_number', to_jsonb(old)->>'id');
  end if;
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'field_calls', 'installation_calls', 'pm_calls', 'reports',
    'spare_requests', 'spare_request_lines', 'spare_consumption', 'feedback'
  ] loop
    if to_regclass('public.' || t) is not null
       and (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'r' then
      execute format('drop trigger if exists no_hard_delete on public.%I', t);
      execute format('create trigger no_hard_delete before delete on public.%I for each row execute function public.block_hard_delete()', t);
    end if;
  end loop;
end $$;
