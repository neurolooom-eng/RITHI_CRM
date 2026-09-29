-- ===========================================================================
-- WHICH PHONES AND LAPTOPS HOLD THE OFFLINE REGISTERS -- read from one desk.
--
--   The user, 2026-09-29: "Build the cache status report for my desk."
--
-- Since v0.9.383 every device keeps the machine register and (v0.9.384) the
-- Party Master in its own browser storage, so it can search with no signal.
-- That copy lives ON THE DEVICE and nothing in the database knew about it, so
-- the only way to tell whether an engineer in the field had one was to look at
-- their screen. Each device now REPORTS what it holds -- how many machines and
-- customers, when each was downloaded, and the last refresh that failed -- and
-- the administrator reads every device on one screen.
--
-- WHAT A ROW IS: one person on one device (a random id the browser keeps), so
-- an engineer with a phone and a laptop is two rows, which is the truth -- each
-- device has its own copy or none.
--
-- WHO WRITES IT: the device, for ITS OWN signed-in person only. `user_id` is
-- STAMPED from the session and a caller-supplied value is DISCARDED (the
-- 0113/0114 rule: refusing makes an honest client fail, discarding makes a
-- buggy one harmless). The policies then only ever match the caller's own row.
--
-- WHO READS IT: the person themselves, and whoever holds the screen's module
-- key `mod:/device-cache` -- administrators by `has_perm` (which is true for an
-- admin and a super admin), Technical Support by the grant below, and any
-- other role an administrator ticks on Roles & Permissions. The screen and the
-- rows are gated by the SAME key, so the two cannot disagree.
--
-- WHAT IT HOLDS IS NOT SENSITIVE: counts, times, an error message and the
-- browser's own description of itself. No machine, customer or search is
-- reported.
-- ===========================================================================

create table if not exists public.device_cache_status (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid(),
  device_id       text not null,
  device_label    text not null default '',
  user_agent      text not null default '',
  app_version     text not null default '',
  storage_ok      boolean not null default true,
  machines        integer not null default 0,
  machines_at     timestamptz,
  machines_error  text not null default '',
  customers       integer not null default 0,
  customers_at    timestamptz,
  customers_error text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- THE UPSERT TARGET: a plain unique index on two columns, no predicate and no
-- expression, which is the only shape PostgREST can infer (check:upserts).
create unique index if not exists device_cache_status_user_device
  on public.device_cache_status (user_id, device_id);

comment on table public.device_cache_status is
  'One row per person per device: what that device holds of the offline machine register and Party Master, as the device last reported it (0249).';

-- ---- stamped, never taken from the caller ---------------------------------
create or replace function public.device_cache_status_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;

drop trigger if exists device_cache_status_stamp on public.device_cache_status;
create trigger device_cache_status_stamp
  before insert or update on public.device_cache_status
  for each row execute function public.device_cache_status_stamp();

-- ---- row-level security ----------------------------------------------------
alter table public.device_cache_status enable row level security;

drop policy if exists dcs_read on public.device_cache_status;
create policy dcs_read on public.device_cache_status for select to authenticated
  using (user_id = auth.uid() or public.has_perm('mod:/device-cache'));

drop policy if exists dcs_insert on public.device_cache_status;
create policy dcs_insert on public.device_cache_status for insert to authenticated
  with check (user_id = auth.uid());

-- AN UPSERT THAT FINDS ITS ROW IS AN UPDATE, and needs this policy -- the
-- `feedback` lesson. Own row only, same audience as the insert.
drop policy if exists dcs_update on public.device_cache_status;
create policy dcs_update on public.device_cache_status for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No delete policy: nothing in the app removes a row, and a device that is
-- signed out reports an EMPTY copy rather than vanishing from the report.

grant select, insert, update on public.device_cache_status to authenticated;
revoke all on public.device_cache_status from anon;

-- ---- the report ------------------------------------------------------------
-- EVERYBODY, INCLUDING WHO HAS NEVER REPORTED. A person with no row is the
-- answer the administrator most needs ("this engineer has no copy anywhere")
-- and a read of the table alone cannot show an absence. `profiles` is readable
-- only by its owner and user managers, so this is a DEFINER function with the
-- permission test INSIDE it -- the rule for a definer function the app calls --
-- and EXECUTE is withdrawn from the not-signed-in role.
create or replace function public.device_cache_report()
returns table (
  user_id uuid, full_name text, email text, role text, active boolean,
  device_id text, device_label text, user_agent text, app_version text, storage_ok boolean,
  machines integer, machines_at timestamptz, machines_error text,
  customers integer, customers_at timestamptz, customers_error text,
  first_reported_at timestamptz, reported_at timestamptz
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
           d.created_at, d.updated_at
      from public.profiles p
      full join public.device_cache_status d on d.user_id = p.id
     order by coalesce(p.full_name, ''), d.updated_at desc nulls last;
end $$;

revoke execute on function public.device_cache_report() from public, anon;
grant execute on function public.device_cache_report() to authenticated;

-- ---- the screen's key reaches somebody -------------------------------------
-- The 0241 pattern, word for word in intent: MERGED into `admin` and
-- `technical_support` (row 114: Technical Support holds every module key the
-- admin holds), never overwritten, and a role with ZERO permissions left alone.
-- No other role is touched; grant it on Roles & Permissions if wanted.
do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then
    raise notice '0249: app_roles is missing -- run rbac.sql first. The key is not granted.';
    return;
  end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select 'mod:/device-cache' as v
             ) u
         ),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/device-cache');
  get diagnostics n = row_count;
  raise notice '0249: % of 2 role(s) given mod:/device-cache (admin + technical_support)', n;
end $$;

-- ---- the five system columns (0244) -----------------------------------------
-- A table created AFTER 0244 does not get them from it, and `_status.sql` row
-- 187 then reads NO until somebody re-runs sys_columns.sql. So it attaches
-- itself, through 0244's own helper -- guarded, because on a fresh apply this
-- bundle runs before sys_columns (which then covers it anyway).
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.device_cache_status'::regclass);
  end if;
end $$;
