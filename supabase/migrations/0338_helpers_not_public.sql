-- ===========================================================================
-- 0338 — THREE DEFINER HELPERS ARE NOT CALLABLE WITHOUT SIGNING IN
--        (second re-review, 2026-10-03: D-134)
--
-- Postgres grants EXECUTE to PUBLIC and Supabase grants it to anon, so these
-- ran with the owner's rights for anybody holding the web key (CLAUDE.md, the
-- 0248 lockdown):
--   notify_resolve_uid(text, text)   turns an email or a name into a login id
--                                    (measured: as anon it returned one)
--   engineer_stock_available(text, text)  any engineer's balance of any part
--   due_export_schedules()           which scheduled exports are owed
-- WHO STILL CALLS THEM: the first two are called only from the stock and
-- notification triggers, which run as the owner; the third only from the
-- scheduled-export Edge Function, with the service role key (index.ts). No
-- screen calls any of them, so signed-in users keep exactly what they had --
-- EXECUTE for authenticated is granted back explicitly for the first two, since
-- revoking PUBLIC would otherwise take it from them too.
-- ===========================================================================
do $$
begin
  if to_regprocedure('public.notify_resolve_uid(text, text)') is not null then
    execute 'revoke execute on function public.notify_resolve_uid(text, text) from public, anon';
    execute 'grant execute on function public.notify_resolve_uid(text, text) to authenticated';
  end if;
  if to_regprocedure('public.engineer_stock_available(text, text)') is not null then
    execute 'revoke execute on function public.engineer_stock_available(text, text) from public, anon';
    execute 'grant execute on function public.engineer_stock_available(text, text) to authenticated';
  end if;
  if to_regprocedure('public.due_export_schedules()') is not null then
    execute 'revoke execute on function public.due_export_schedules() from public, anon, authenticated';
    begin
      execute 'grant execute on function public.due_export_schedules() to service_role';
    exception when undefined_object then null;   -- a plain Postgres has no service_role
    end;
  end if;
end $$;
