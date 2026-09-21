-- ===========================================================================
-- A CANCELLED CALL IS NOT "REPORT PENDING".
--
-- The user, 2026-09-21, looking at a reporting upload: "How did it become
-- Report Pending?" Measured on the file: 11,957 rows, every one carrying a
-- status, producing 36 Report-pending calls out of 7,006 -- and NINETEEN of
-- those 36 have `last_status = 'Canceled'`.
--
-- `open_state` (0032) tests unattended, unsolved, report-pending, then
-- `solved%`, and everything it does not recognise falls into a final ELSE
-- returning 'Report pending'. A cancelled call is not report-pending; it is
-- cancelled, and it was being put in a queue of work somebody is chasing.
--
-- THE CLIENT ALREADY KNEW. `stateBucket()` in src/lib/callstate.tsx has
-- `if (/cancel/i.test(t)) return 'Cancelled'`, with its own slate chip and
-- label. Five screens read `open_state` STRAIGHT FROM THE DATABASE, so those
-- showed "Report pending" for a call the register would otherwise colour
-- Cancelled. The two disagreed; this settles it in the database.
--
-- ---------------------------------------------------------------------------
-- WHY A TRIGGER RATHER THAN A NEW GENERATED EXPRESSION.
--
-- PostgreSQL before 17 cannot CHANGE a generation expression: it has to be
-- dropped and re-added, and dropping the column takes every view that reads it
-- with it. Measured on a database built from every migration: `open_state` on
-- the three call tables is read by `calls`, `field_call_review` and
-- `field_call_review_summary`, and the `calls` view is in turn read by
-- call_report, call_state, consumption_report, failure_rate_by_product,
-- field_failure_register, pending_calls, solved_without_report and
-- unused_spare_report. ELEVEN VIEWS to drop and rebuild, each needing
-- `security_invoker` re-asserted -- the exact rebuild this project has got
-- wrong three times (0040/0050/0057, where `calls` lost the setting and every
-- signed-in user could read every call).
--
-- `ALTER COLUMN ... DROP EXPRESSION` (PG13+) turns the generated column into an
-- ordinary one IN PLACE. Proved on a built database inside a transaction: all
-- eight views still there afterwards, both indexes still there, the column
-- still there and no longer generated. A BEFORE trigger then keeps it, which
-- is what this project does everywhere else a derived value must be right.
--
-- THE VALUE IS STAMPED, NEVER ACCEPTED. The column is writable now, so the
-- trigger overwrites whatever a caller sends -- the 0113/0114 rule: a
-- caller-supplied value is DISCARDED, not refused, because refusing makes an
-- honest client fail and discarding makes a buggy one harmless.
--
-- SCOPE. Only the cancelled branch is added. `stateBucket()` also knows
-- 'Reopened', and it tests report-pending BEFORE unsolved where this tests
-- unsolved first (0032's own comment says that order was deliberate). Neither
-- is changed here: they are separate decisions and this one was asked for.
-- ===========================================================================

-- ---- the rule, in one place ------------------------------------------------
create or replace function public.call_open_state(p_status text, p_visit timestamptz)
returns text language sql immutable set search_path = public as $$
  select case
    -- A call with no visit and nothing said about it has not been attended.
    when p_visit is null and coalesce(p_status, '') = ''        then 'Unattended'
    -- CANCELLED FIRST of the status tests: a cancelled call is cancelled
    -- whatever else the text says. `%cancel%` matches both spellings, which
    -- the register carries -- the AppSheet export writes 'Canceled'.
    when lower(coalesce(p_status, '')) like '%cancel%'          then 'Cancelled'
    when lower(coalesce(p_status, '')) like '%unsolved%'        then 'Unsolved'
    when lower(coalesce(p_status, '')) like '%report pending%'  then 'Report pending'
    when lower(coalesce(p_status, '')) like 'solved%'           then 'Solved'
    else 'Report pending'
  end;
$$;
grant execute on function public.call_open_state(text, timestamptz) to authenticated;

comment on function public.call_open_state(text, timestamptz) is
  'The bucket a call''s status falls into. Mirrors stateBucket() in src/lib/callstate.tsx for the cancelled branch; check:ui compares the two.';

-- ---- convert the column and keep it with a trigger -------------------------
create or replace function public.call_open_state_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Whatever the caller sent is discarded. This is a derived value.
  new.open_state := public.call_open_state(new.last_status, new.last_visit_at);
  return new;
end $$;

do $conv$
declare t text; n int := 0;
begin
  foreach t in array array['calls', 'field_calls', 'installation_calls', 'pm_calls'] loop
    -- `calls` is a TABLE before 0040 and a VIEW after it. Skip the view.
    continue when to_regclass('public.' || t) is null
              or (select relkind from pg_class where oid = ('public.' || t)::regclass) <> 'r';
    continue when not exists (select 1 from information_schema.columns
                               where table_schema = 'public' and table_name = t
                                 and column_name = 'open_state');

    -- Only if it is still generated; re-running this migration must not fail.
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = t
                  and column_name = 'open_state' and is_generated = 'ALWAYS') then
      execute format('alter table public.%I alter column open_state drop expression', t);
    end if;

    execute format('drop trigger if exists call_open_state_t on public.%I', t);
    execute format('create trigger call_open_state_t before insert or update on public.%I '
                   'for each row execute function public.call_open_state_stamp()', t);

    -- Recompute every existing row. This is what makes a re-upload
    -- unnecessary: the statuses on the rows were always right, the expression
    -- reading them was not.
    execute format('update public.%I set open_state = public.call_open_state(last_status, last_visit_at) '
                   'where open_state is distinct from public.call_open_state(last_status, last_visit_at)', t);
    n := n + 1;
  end loop;
  raise notice '0226: open_state is now stamped on % call table(s).', n;
end $conv$;
