-- ===========================================================================
-- 0166 — the Field Failure Register keeps its records.
--
-- Filed in `data_integrity` rather than beside the table (0165), because
-- block_hard_delete() is defined in THIS module and this module runs AFTER
-- daily_review in ALL_ORDER. Putting the trigger next to the table made a fresh
-- apply fail on a function that did not exist yet, which check:replay caught.
--
-- GUARDED on the table's presence, the way the replay tails are: running
-- data_integrity alone against a database that has not had daily_review yet
-- must skip this, not fail.
--
-- Deletion is already impossible for the application without this: 0165 grants
-- no DELETE policy, so a delete as `authenticated` matches no rows and silently
-- affects none. This is the second lock — it turns that silence into a refusal
-- the day somebody adds a delete policy.
-- ===========================================================================
do $$
begin
  if to_regclass('public.field_failure_reports') is not null
     and to_regprocedure('public.block_hard_delete()') is not null then
    execute 'drop trigger if exists no_hard_delete on public.field_failure_reports';
    execute 'create trigger no_hard_delete before delete on public.field_failure_reports '
         || 'for each row execute function public.block_hard_delete()';
  end if;
end $$;
