-- ===========================================================================
-- 0407 — A FIELD FAILURE REPORT NAMES ITS CUSTOMER AND ITS PROBLEM
--        (second re-review D-027)
--
-- The Field Failure Report form refuses a report without Customer Name or
-- Problem reported, but field_failure_reports defaults both to empty text, so
-- an insert through the data interface without them succeeded. The rule is now
-- the database's as well:
--   * a signed-in INSERT needs both;
--   * a signed-in UPDATE may not BLANK either -- a report recorded before this
--     with one of them empty can still be edited (its weekly review recorded),
--     it is only never emptied.
-- Not stopped: an import (bulk.upload / import.panel), a connection with no
-- session, and a function running as its owner (ffr_from_review raises a
-- report from the Daily Complaint Review and fills both from the call).
-- In the daily_review module, after 0401.
-- ===========================================================================

create or replace function public.ffr_customer_and_problem_required()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_missing text[] := '{}';
begin
  if auth.uid() is null then return new; end if;
  if current_user <> 'authenticated' then return new; end if;
  if public.has_perm('bulk.upload') or public.has_perm('import.panel') then return new; end if;
  if btrim(coalesce(new.customer_name, '')) = ''
     and (tg_op = 'INSERT' or btrim(coalesce(old.customer_name, '')) <> '') then
    v_missing := v_missing || 'Customer Name'::text;
  end if;
  if btrim(coalesce(new.problem_reported, '')) = ''
     and (tg_op = 'INSERT' or btrim(coalesce(old.problem_reported, '')) <> '') then
    v_missing := v_missing || 'Problem Reported'::text;
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'A Field Failure Report needs the Customer Name and the Problem Reported (missing: %)',
      array_to_string(v_missing, ', ') using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.ffr_customer_and_problem_required() from public, anon, authenticated;
drop trigger if exists ffr_customer_and_problem_required on public.field_failure_reports;
create trigger ffr_customer_and_problem_required
  before insert or update of customer_name, problem_reported on public.field_failure_reports
  for each row execute function public.ffr_customer_and_problem_required();
