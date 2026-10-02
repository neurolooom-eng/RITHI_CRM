-- ===========================================================================
-- THE AUDIT LOG ADMITS WHOEVER THE AUDIT LOG SCREEN ADMITS (D-066, FRS-204).
--
-- The Audit Log screen opens for a holder of `audit.view`; its trail,
-- audit_log, was readable by administrators only (0009: `using (is_admin())`).
-- So a non-administrator granted audit.view opened a page that was always
-- empty -- which reads as "nothing happened", not as "you may not see". The
-- record-level trail beside it, record_audit, already admits
-- `is_admin() or has_perm('audit.view')` (0048); the two trails disagreed
-- about their own audience.
--
-- Now both say the same thing. Writing to the log is unchanged (audit_insert),
-- and nothing can update or delete it.
-- Each half wrapped in a sub-select so it is asked once per query, not once
-- per row (0250 -- the audit log is the largest table this app reads).
-- ===========================================================================

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select
  using ((select public.is_admin()) or (select public.has_perm('audit.view')));
