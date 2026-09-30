-- ===========================================================================
-- SWITCHING AUDIT MODE IS audit.mode.
-- WHAT WAS AN ADMINISTRATOR'S ALONE IS A KEY (the user, 2026-09-30: "All
-- Admin Actions that are greyed out now should be editable from the Role &
-- Permissions. Only the Admin Role should be Greyed out not the Actions.")
--
-- is_admin() becomes has_perm(<key>). An administrator still passes -- has_perm()
-- answers true for is_admin() -- so nobody loses anything, and NOBODY ELSE GAINS
-- ANYTHING ON THE DAY: no role holds the new key until an administrator ticks it
-- on Roles & Permissions. coalesce(..., false) so a NULL (no session) refuses.
--
-- A reason is still demanded and every change is still kept. Its history is
-- readable by a holder of the key as well as by audit.view.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_audit_mode(p_on boolean, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_now boolean;
begin
  if not coalesce(public.has_perm('audit.mode'), false) then
    raise exception 'RBAC: changing Audit Mode needs "Switch Audit Mode on or off"';
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
end $function$;

drop policy if exists amc_read on public.audit_mode_changes;
create policy amc_read on public.audit_mode_changes for select
  using (public.is_admin() or public.has_perm('audit.view') or public.has_perm('audit.mode'));
