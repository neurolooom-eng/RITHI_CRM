-- ===========================================================================
-- AUDIT MODE — a switch only an administrator can throw.
--
-- Asked for by the user on 2026-09-06, WITH THE RULES TO FOLLOW: "come up with
-- an Audit Mode, which can be toggled only by the admins — I will give the list
-- of rules for that later". So this migration builds the switch and nothing
-- else. NOTHING IN THE APPLICATION READS IT YET, and that is not an oversight
-- — attaching behaviour to it before the rules arrive would mean guessing what
-- an audit is supposed to change, and guessing wrong in a regulated system is
-- worse than waiting.
--
-- WHAT IS HERE:
--   * the setting itself, in `app_settings` alongside audit_retention_days,
--     because that is where this project keeps configuration;
--   * `audit_mode()` — a stable read anything may call;
--   * `set_audit_mode()` — the only way to change it, admin-only, and it
--     refuses without a reason;
--   * `audit_mode_changes` — every flip, who and when and why, in its own
--     table.
--
-- WHY ITS OWN LOG TABLE. `audit_log` is written by the CLIENT and purged on a
-- retention window (0047). A switch that changes what the system does during an
-- audit is exactly the thing whose history must outlive both of those, so it is
-- recorded by the function itself, on the server, into a table nothing purges
-- and nobody can UPDATE or DELETE through the API. Whatever the rules turn out
-- to be, the fact that the mode was on — and for how long — will always be
-- answerable.
--
-- CLASSIFICATION. Documented in the Validation Package as a NON-AUDITABLE
-- REQUIREMENT (NAR-001), per the user's instruction. That is a statement about
-- the requirement's provenance — it is not derived from a regulatory clause and
-- is not offered as evidence of one — and NOT a statement that its use goes
-- unrecorded. Its use is recorded here, permanently.
-- ===========================================================================

-- app_settings is created by 0047 (audit module). Guarded so this file can be
-- replayed on a project where that has not run yet without dying.
do $mode$
begin
  if to_regclass('public.app_settings') is null then
    raise notice 'app_settings is missing — run 0047_audit_retention_compliance.sql first';
    return;
  end if;
  insert into public.app_settings (key, value) values ('audit_mode', 'off')
    on conflict (key) do nothing;
end $mode$;

-- ---- the log ---------------------------------------------------------------
create table if not exists public.audit_mode_changes (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  turned_on  boolean     not null,
  reason     text        not null,
  changed_by uuid        references auth.users (id)
);
create index if not exists audit_mode_changes_at_idx on public.audit_mode_changes (at desc);

alter table public.audit_mode_changes enable row level security;
-- SELECT only, and only for an administrator. There is no insert/update/delete
-- policy at all, so the ONLY way a row appears is `set_audit_mode()` — a
-- SECURITY DEFINER function, which RLS does not stand in the way of. A history
-- the API cannot edit is the point of the table.
grant select on public.audit_mode_changes to authenticated;
revoke insert, update, delete on public.audit_mode_changes from authenticated;
drop policy if exists amc_read on public.audit_mode_changes;
create policy amc_read on public.audit_mode_changes for select
  using (public.is_admin() or public.has_perm('audit.view'));

-- ---- read ------------------------------------------------------------------
create or replace function public.audit_mode()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select lower(btrim(value)) in ('on', 'true', '1', 'yes')
       from public.app_settings where key = 'audit_mode'),
    false)
$$;
revoke all on function public.audit_mode() from public;
grant execute on function public.audit_mode() to authenticated;

-- ---- write -----------------------------------------------------------------
-- Admin only, by the user's instruction. Not `config.manage`, which is what
-- app_settings' own write policy allows: the user said ADMINS, and a switch is
-- not a retention number.
create or replace function public.set_audit_mode(p_on boolean, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_now boolean;
begin
  if not public.is_admin() then
    raise exception 'RBAC: only an administrator can change Audit Mode';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Changing Audit Mode needs a reason';
  end if;

  v_now := public.audit_mode();
  if v_now is not distinct from p_on then
    -- Not an error, and not a log entry either: recording "changed from off to
    -- off" would pad the history that the history exists to keep readable.
    return v_now;
  end if;

  insert into public.app_settings (key, value, updated_at)
       values ('audit_mode', case when p_on then 'on' else 'off' end, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.audit_mode_changes (turned_on, reason, changed_by)
       values (p_on, btrim(p_reason), auth.uid());

  return p_on;
end $$;
revoke all on function public.set_audit_mode(boolean, text) from public;
grant execute on function public.set_audit_mode(boolean, text) to authenticated;

comment on table public.audit_mode_changes is
  'Every change of Audit Mode: on/off, why, who, when. Written only by set_audit_mode(); never purged, never editable through the API.';
