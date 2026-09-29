-- ===========================================================================
-- DEVICE CACHE STATUS: THE STANDARD COMPLAINTS TOO.
--
--   The user, 2026-09-30: "Standard Complaint cache details not displayed in
--   both in view as well as the Device Cache Status."
--
-- Since v0.9.395 every call form filters the Standard Complaint list by the
-- call's product, and each device keeps that list for six hours so a Call
-- Request can be filled with no signal. It is the third thing a device holds
-- for offline use, beside the machine register and the Party Master, so the
-- report carries it the same way: how many complaints, and when they were
-- stored. Nothing else about the list is sent.
--
-- The report function is DROPPED AND REBUILT because its return columns grow
-- (create-or-replace cannot do that); the two new columns are LAST, so the
-- earlier ones keep their positions. The permission check, the definer
-- rights and the revoke from the not-signed-in role are exactly 0249's.
-- A device on an older build sends no complaints -- the columns default.
-- ===========================================================================

alter table public.device_cache_status
  add column if not exists complaints    integer not null default 0,
  add column if not exists complaints_at timestamptz;

drop function if exists public.device_cache_report();
create function public.device_cache_report()
returns table (
  user_id uuid, full_name text, email text, role text, active boolean,
  device_id text, device_label text, user_agent text, app_version text, storage_ok boolean,
  machines integer, machines_at timestamptz, machines_error text,
  customers integer, customers_at timestamptz, customers_error text,
  first_reported_at timestamptz, reported_at timestamptz,
  complaints integer, complaints_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('mod:/device-cache') then
    raise exception 'RBAC: the Device Cache Status report needs the mod:/device-cache permission.'
      using errcode = '42501';
  end if;
  return query
    select coalesce(p.id, d.user_id), coalesce(p.full_name, ''), coalesce(p.email, ''),
           coalesce(p.role, ''), coalesce(p.active, true),
           d.device_id, d.device_label, d.user_agent, d.app_version, d.storage_ok,
           d.machines, d.machines_at, d.machines_error,
           d.customers, d.customers_at, d.customers_error,
           d.created_at, d.updated_at,
           d.complaints, d.complaints_at
      from public.profiles p
      full join public.device_cache_status d on d.user_id = p.id
     order by coalesce(p.full_name, ''), d.updated_at desc nulls last;
end $$;

revoke execute on function public.device_cache_report() from public, anon;
grant execute on function public.device_cache_report() to authenticated;
