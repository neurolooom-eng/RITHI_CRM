-- ===========================================================================
-- Let a creator read back the call they just inserted (so insert...returning
-- works for everyone, not only admins). Fixes "new call saved locally / pending"
-- when the register is on Supabase.
-- ===========================================================================

do $calls_guard$ begin
-- 0040_call_tables_split.sql replaces public.calls with a VIEW over the three
-- typed call tables. What follows is table-only work, so on a project that has
-- already been split it has to be SKIPPED, not attempted — otherwise replaying
-- this file (which re-running any bundle does) dies with
--   ERROR 42809: cannot create index on relation "calls"
-- or "calls is not a table". On an unsplit project it runs exactly as before.
if (select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'calls') = 'r' then
execute $calls_sql$
drop policy if exists calls_scoped_read on public.calls;
create policy calls_scoped_read on public.calls for select
  using (public.can_see_call(allocated_to) or created_by = auth.uid());

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update
  using (public.can_see_call(allocated_to) or created_by = auth.uid())
  with check (public.can_see_call(allocated_to) or created_by = auth.uid());
$calls_sql$;
end if;
end $calls_guard$;
