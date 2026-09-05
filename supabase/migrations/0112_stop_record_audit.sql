-- ===========================================================================
-- STOP WRITING TO record_audit. THE AUDIT LOG IS ENOUGH.
--
-- 0048 added a database-enforced trail — a before/after image of every row
-- written to the ten quality-record tables — because a defensible 21 CFR
-- Part 11 trail has to be created by the database rather than the client.
-- Part 11 is FDA's; this operation is regulated by CDSCO under the Medical
-- Devices Rules, 2017, which asks for records to be controlled and retrievable
-- and does not prescribe that second trail. The user's decision, 2026-09-05:
-- `audit_log` is the trail.
--
-- WHAT THIS DOES AND DOES NOT DO.
--   • The ten triggers are dropped, so nothing writes to `record_audit` again.
--   • The TABLE STAYS, with whatever it already holds. It is a quality record
--     of what happened while it was running, and 0049 forbids deleting those.
--     Dropping it is a separate decision and a separate script.
--   • `record_audit_fn()` stays too, unattached. Re-attaching is then one
--     `create trigger`, not a migration to write again.
--
-- IT IS A REDUCTION, AND THE PACKAGE SAYS SO. `audit_log` is written by the
-- CLIENT: it can be bypassed by a direct API call and it is purged on the
-- retention window. `record_audit` could not be bypassed and was not purged.
-- The validation package is updated in the same change rather than left
-- claiming a control that has been switched off.
-- ===========================================================================

do $stop$
declare t text;
begin
  foreach t in array array[
    'field_calls', 'installation_calls', 'pm_calls', 'reports', 'call_requests',
    'pending_registrations', 'feedback', 'spare_requests', 'spare_request_lines',
    'spare_consumption'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists record_audit_i on public.%I', t);
      execute format('drop trigger if exists record_audit_u on public.%I', t);
      execute format('drop trigger if exists record_audit_d on public.%I', t);
    end if;
  end loop;
end $stop$;

-- Nothing writes it now, so nothing should think it can. The read policy is
-- left alone: what is already recorded stays readable by an administrator.
comment on table public.record_audit is
  'HISTORICAL. Written by triggers from 0048 until 0112 stopped them (2026-09-05) — audit_log is the trail now. Retained, not maintained: everything here happened while it was running.';
