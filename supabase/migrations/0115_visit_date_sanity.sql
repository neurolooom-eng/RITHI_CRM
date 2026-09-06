-- ===========================================================================
-- A VISIT CANNOT HAVE HAPPENED IN THE FUTURE, OR BEFORE THE COMPLAINT.
--
-- The user's two rules (2026-09-06), on the Visit Update form. Both are about a
-- visit that has not happened, rather than one recorded untidily:
--
--   1. NOT IN THE FUTURE. A call's status comes from its LATEST visit, so a
--      visit dated next week closes a call nobody has been to — and keeps it
--      closed until that day passes.
--   2. NOT BEFORE THE COMPLAINT. Nobody attended a fault that had not been
--      reported, and every response-time figure taken from the pair goes
--      negative.
--
-- The form enforces both. This is the same rule where it cannot be typed past:
-- `min`/`max` on a date input stop the PICKER, not a pasted value, and a visit
-- report is a quality record.
--
-- ---------------------------------------------------------------------------
-- WHAT IT DELIBERATELY DOES NOT JUDGE: HISTORY.
--
-- `reports` is also where the superseded system's visits live, and they must be
-- loadable exactly as they were — a file whose dates are imperfect is still the
-- record of what happened, and refusing it would leave the register with a gap
-- instead of an imperfection. That is the same exemption 0089 makes for
-- imported stock.
--
-- The signal is the row's own id, which each writer sets and none of them share:
--
--   WEB-…   the Visit Update form (saveReport)     -> CHECKED
--   IMP-…   Bulk Uploads, derived from call + date -> not checked
--   other   Bulk Report Mapping (carries source_ref), a restore, a migration
--                                                  -> not checked
--
-- So the rule governs what is ENTERED from today, and says nothing about what
-- was loaded. Widening it later is one line; it would want a look at the
-- existing data first, which is why it is not done here.
--
-- A call with NO complaint date is held to rule 1 only: there is nothing to
-- compare against, and refusing the visit would invent a requirement.
--
-- TIMEZONE, and why this is not `> now()`. The app writes the chosen calendar
-- day as UTC midnight (`2026-09-06T00:00:00Z`). Between midnight and 05:30 IST
-- that instant is still in the FUTURE relative to now(), so a plain `> now()`
-- would refuse a visit entered early in the morning and dated today. The
-- comparison is therefore between DAYS: the visit's own day (UTC, as written)
-- against today in India, which is where the business is.
-- ===========================================================================

create or replace function public.reports_visit_date_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_visit date; v_complaint date; v_today date;
begin
  if new.visit_at is null then return new; end if;

  -- Only what the Visit Update form writes. See the header.
  if coalesce(new.uid, '') !~ '^WEB-' then return new; end if;

  -- An UPDATE that leaves the date alone is not this trigger's business — a
  -- report corrected years later must not be blocked by a rule about when it
  -- was entered.
  if tg_op = 'UPDATE' and old.visit_at is not distinct from new.visit_at then
    return new;
  end if;

  v_visit := (new.visit_at at time zone 'UTC')::date;
  v_today := (now() at time zone 'Asia/Kolkata')::date;

  if v_visit > v_today then
    raise exception 'A visit cannot be dated in the future (% is after %)', v_visit, v_today
      using errcode = 'check_violation';
  end if;

  select c.complaint_date into v_complaint from public.calls c where c.ucn = new.ucn;
  if v_complaint is not null and v_visit < v_complaint then
    raise exception 'A visit cannot be dated before the complaint (% is before %)', v_visit, v_complaint
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists reports_visit_date_guard on public.reports;
create trigger reports_visit_date_guard
  before insert or update on public.reports
  for each row execute function public.reports_visit_date_guard();

comment on function public.reports_visit_date_guard() is
  'A visit entered on the Visit Update form (uid WEB-...) cannot be dated in the future or before its call''s complaint date. Imported history is exempt by design — see the migration header.';
