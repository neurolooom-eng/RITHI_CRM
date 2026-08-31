-- ===========================================================================
-- Audit-log retention: keep 7 days, auto-delete anything older.
-- A daily pg_cron job runs purge_audit_log(). Safe to run in the SQL editor
-- as the `postgres` role; it enables pg_cron if it isn't already on.
-- ===========================================================================

-- Delete audit rows older than 7 days. Returns how many were removed.
create or replace function public.purge_audit_log()
returns integer
language plpgsql
security definer
set search_path = public as $$
declare removed integer;
begin
  delete from public.audit_log where at < now() - interval '7 days';
  get diagnostics removed = row_count;
  return removed;
end $$;

-- Clear one week of backlog immediately so the policy takes effect now.
select public.purge_audit_log();

-- Schedule it daily at 00:30 UTC via pg_cron.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'Could not enable pg_cron automatically (%). Enable it in Dashboard -> Database -> Extensions, then re-run this migration.', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Re-scheduling is idempotent: drop the old job first if present.
    if exists (select 1 from cron.job where jobname = 'purge-audit-log') then
      perform cron.unschedule('purge-audit-log');
    end if;
    perform cron.schedule('purge-audit-log', '30 0 * * *', 'select public.purge_audit_log();');
  else
    raise notice 'pg_cron is not enabled. Audit rows will NOT auto-delete until you enable pg_cron (Dashboard -> Database -> Extensions) and re-run this file. Until then, run: select public.purge_audit_log();';
  end if;
end $$;
