-- ===========================================================================
-- Audit-log retention for a regulated QMS. The earlier 7-day auto-delete is not
-- acceptable for medical-device quality records — the audit trail must be kept
-- for the record retention period. Retention is now a CONFIGURABLE setting,
-- defaulting to 3650 days (~10 years). The daily purge uses it. The database
-- audit trail (record_audit, 0048) is NOT purged by this job.
-- ===========================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values ('audit_retention_days', '3650')
  on conflict (key) do nothing;

alter table public.app_settings enable row level security;
grant select, insert, update on public.app_settings to authenticated;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select using (auth.role() = 'authenticated');
drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings for all
  using (public.is_admin() or public.has_perm('config.manage'))
  with check (public.is_admin() or public.has_perm('config.manage'));

-- Purge uses the configured retention (fallback 3650 days). Redefinition only —
-- the daily pg_cron job scheduled by 0033 keeps calling this function.
create or replace function public.purge_audit_log()
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer; days integer;
begin
  select coalesce(nullif(value, '')::int, 3650) into days from public.app_settings where key = 'audit_retention_days';
  days := greatest(coalesce(days, 3650), 1);
  delete from public.audit_log where at < now() - make_interval(days => days);
  get diagnostics removed = row_count;
  return removed;
end $$;
