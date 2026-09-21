-- ===========================================================================
-- TURN THE DATABASE-ENFORCED AUDIT TRAIL BACK ON.
--
-- The user, 2026-09-21: "Turn on Audit."
--
-- This is a REVERSAL of 0112, which switched `record_audit` off on the user's
-- decision of 2026-09-05 that `audit_log` was trail enough. 0112 said what
-- turning it back on would cost: "Re-attaching is then one `create trigger`,
-- not a migration to write again." This is that file.
--
-- WHY IT MATTERS, in this project's own words rather than a standard's.
-- 0112's header names the difference exactly:
--
--     `audit_log` is written by the CLIENT: it can be bypassed by a direct API
--     call and it is purged on the retention window. `record_audit` could not
--     be bypassed and was not purged.
--
-- On 2026-09-20 a bundle re-ran a bare statement and set 4,222 calls back to
-- Unattended, and the evidence that would have named what they were BEFORE did
-- not exist. A before/after image of every row, written by the database, is
-- precisely what answers that question. It is the control that was switched
-- off, and this turns it back on.
--
-- WHAT IS RESTORED IS 0103's SHAPE, NOT 0048's -- verbatim, because a bulk
-- load must stay ONE audit event rather than ten thousand. Three
-- STATEMENT-level triggers per table (insert / update / delete), each naming
-- the transition table it needs, since INSERT has no OLD and DELETE no NEW.
-- `record_audit_fn()` is untouched: 0112 deliberately left it in place,
-- unattached, so nothing here has to be re-derived.
--
-- IT IS AN INCREASE IN CONTROL AND THE PACKAGE SAYS SO. 0112 recorded the
-- reduction honestly; this records the restoration the same way.
--
-- Idempotent: every trigger is dropped by name before it is created, so
-- replaying the bundle re-arms rather than duplicating.
-- ===========================================================================

do $on$
declare t text; n int := 0;
begin
  if to_regproc('public.record_audit_fn') is null then
    raise notice '0225: record_audit_fn() is missing -- run 0048_record_audit.sql first. Nothing armed.';
    return;
  end if;

  -- The same ten quality-record tables 0103 named, in the same order.
  foreach t in array array[
    'field_calls', 'installation_calls', 'pm_calls', 'reports',
    'spare_requests', 'spare_request_lines', 'spare_consumption', 'feedback',
    'call_requests', 'pending_registrations'
  ] loop
    if to_regclass('public.' || t) is not null
       and (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'r' then
      -- Includes 0048's row-level `record_audit_t`: if a project somehow still
      -- carries it, it goes, or the same write would be audited twice.
      execute format('drop trigger if exists record_audit_t on public.%I', t);
      execute format('drop trigger if exists record_audit_i on public.%I', t);
      execute format('drop trigger if exists record_audit_u on public.%I', t);
      execute format('drop trigger if exists record_audit_d on public.%I', t);
      execute format('create trigger record_audit_i after insert on public.%I '
                     'referencing new table as new_rows for each statement '
                     'execute function public.record_audit_fn()', t);
      execute format('create trigger record_audit_u after update on public.%I '
                     'referencing old table as old_rows new table as new_rows for each statement '
                     'execute function public.record_audit_fn()', t);
      execute format('create trigger record_audit_d after delete on public.%I '
                     'referencing old table as old_rows for each statement '
                     'execute function public.record_audit_fn()', t);
      n := n + 1;
    end if;
  end loop;
  raise notice '0225: record_audit armed on % of 10 tables.', n;
end $on$;
