-- ===========================================================================
-- A SPARE CANNOT BE BOOKED AGAINST A CALL NOBODY HAS VISITED.
--
--   The user, 2026-09-18: "Visit Entry Date is Empty, Visit Date & Time is
--   Empty -- No Consumption should be accepted without these Details."
--
-- WHERE THOSE TWO COLUMNS COME FROM, because the fix has to be at the cause
-- rather than the column. `consumption_report` reaches the visit with a LEFT
-- JOIN on the UCN:
--
--     "Visit Entry Date"   <- reports.updated_at
--     "Visit Date & Time"  <- reports.visit_at
--     ... left join last_visit v on v.ucn = sc.ucn
--
-- so BOTH are blank for exactly one reason: the call has no row in `reports`
-- at all. Neither column can be filled in on the consumption row, and neither
-- is missing because of a formatting or a join fault -- the visit was never
-- filed. A consumption line then records a part fitted on a visit that, as far
-- as this system is concerned, never happened.
--
-- IT DOES NOT BREAK THE NORMAL PATH, and that was the thing to establish
-- before writing a guard at all. Call Reporting saves the VISIT first and the
-- spares second (`saveReport` then `addConsumptionRows`, and its own comment
-- says "the visit is already filed, so pressing Save Report again retries just
-- this"). By the time a spare is inserted the report row exists, so every
-- ordinary save passes this untouched.
--
-- WHAT IT DOES STOP:
--   * a RECONCILIATION booked against a call that has never been visited --
--     the case that produced the blank columns;
--   * the BULK CONSUMPTION UPLOAD, for rows whose call has no visit. That is
--     deliberate and it is the rule the user asked for, but it is worth saying
--     plainly: those rows are refused rather than silently landing blank.
--     Genuinely historical consumption has its own table,
--     `spare_consumption_history`, which this does not touch.
--
-- EXISTING ROWS ARE NOT TOUCHED. This is an insert-time rule, so anything
-- already booked stays exactly as it is -- rewriting a quality record to satisfy
-- a rule written afterwards would be worse than the blank. They will go on
-- showing empty visit columns, which is the truth about them.
-- `_consumption_without_a_visit.sql` lists them.
--
-- IT RUNS LAST among the before-insert guards (the `zz_` prefix), so a typo'd
-- UCN still gets `consumption_reconcile_guard`'s "No call found with UCN ... --
-- check the number", which is the more useful answer when the call does not
-- exist at all.
-- ===========================================================================
create or replace function public.consumption_needs_a_visit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- A blank UCN is the reconciliation guard's to refuse, with a better message.
  if btrim(coalesce(new.ucn, '')) = '' then return new; end if;

  if not exists (select 1 from public.reports r where r.ucn = new.ucn) then
    raise exception
      'No visit has been filed on % yet, so a spare cannot be booked against it. '
      'File the visit report first — the spare is recorded on the visit it was used on.',
      new.ucn;
  end if;
  return new;
end $$;

drop trigger if exists zz_consumption_needs_visit on public.spare_consumption;
create trigger zz_consumption_needs_visit
  before insert on public.spare_consumption
  for each row execute function public.consumption_needs_a_visit();
