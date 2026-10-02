-- ===========================================================================
-- STOCK MOVEMENTS, TRAINING RESULTS AND R&R PERIODS ARE IMAGED (D-051, D-062).
--
-- 0225 arms record_audit on ten quality-record tables. Five more were left
-- out, and each is a record somebody relies on later:
--
--   material_returns     a return takes stock off an engineer        (D-051)
--   stock_transfers      a transfer moves stock between engineers    (D-051)
--   training_sessions    who was trained, on what, when              (D-062)
--   training_attendance  each person's Pass / Fail, score, remarks   (D-062)
--   user_rr              a person's role-and-responsibility periods  (D-062)
--
-- Neither screen for the first two wrote an audit entry, while every other
-- stock movement (dispatch, drop, consumption) is audited; the only
-- attribution was sys_created_by (0244). And a session re-saved, or an R&R
-- period edited, replaced what was there with no trace -- a Fail changed to a
-- Pass read the same as a Pass recorded once.
--
-- THE SAME TRIGGERS AS 0225, statement-level with transition tables, so a bulk
-- load is one event rather than thousands. record_audit_fn() pairs an update's
-- before and after on the row's key; all five tables have `id`, which is the
-- last key it tries. Nothing about who may READ record_audit changes.
--
-- In data_integrity, after 0225: every table named here is created by a
-- module earlier in ALL_ORDER, so a fresh apply arms all five. A project
-- missing one of them simply arms the rest -- the notice says how many.
-- ===========================================================================

do $on$
declare t text; n int := 0;
begin
  if to_regproc('public.record_audit_fn') is null then
    raise notice '0314: record_audit_fn() is missing -- run 0048_record_audit.sql first. Nothing armed.';
    return;
  end if;

  foreach t in array array[
    'material_returns', 'stock_transfers',
    'training_sessions', 'training_attendance', 'user_rr'
  ] loop
    if to_regclass('public.' || t) is not null
       and (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'r' then
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
  raise notice '0314: record_audit armed on % of 5 tables.', n;
end $on$;
