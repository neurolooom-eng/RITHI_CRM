-- ===========================================================================
-- 0436 -- A VISIT MAY BE DATED FROM THE BREAKDOWN DATE TO TODAY (the user,
-- 2026-10-14: "Reports can allow a Dates between the Breakdown Date and
-- Today"; asked, the Visit Report's Visit Date).
--
-- reports_visit_date_guard() (0115) refused a visit dated before the call's
-- COMPLAINT DATE. A call registered from a request now carries the day the
-- request was RAISED as its Complaint Date and the day it was ATTENDED as its
-- Breakdown Date (0435), and an engineer is often there before the request is
-- raised -- so the lower bound is the Breakdown Date, falling back to the
-- Complaint Date where a call carries none. Everything else is 0115 as it was:
-- only the Visit Update form's rows (uid WEB-) are judged, never imported
-- history, and a correction that leaves the date alone is not checked.
-- ===========================================================================

create or replace function public.reports_visit_date_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_visit date; v_from date; v_today date;
begin
  if new.visit_at is null then return new; end if;

  -- Only what the Visit Update form writes. See 0115's header.
  if coalesce(new.uid, '') !~ '^WEB-' then return new; end if;

  -- An UPDATE that leaves the date alone is not this trigger's business.
  if tg_op = 'UPDATE' and old.visit_at is not distinct from new.visit_at then
    return new;
  end if;

  v_visit := (new.visit_at at time zone 'UTC')::date;
  v_today := (now() at time zone 'Asia/Kolkata')::date;

  if v_visit > v_today then
    raise exception 'A visit cannot be dated in the future (% is after %)', v_visit, v_today
      using errcode = 'check_violation';
  end if;

  select coalesce(c.breakdown_date, c.complaint_date) into v_from from public.calls c where c.ucn = new.ucn;
  if v_from is not null and v_visit < v_from then
    raise exception 'A visit cannot be dated before the breakdown (% is before %)', v_visit, v_from
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function public.reports_visit_date_guard() is
  'A visit entered on the Visit Update form (uid WEB-...) cannot be dated in the future or before its call''s Breakdown Date (else Complaint Date) (0436). Imported history is exempt by design -- see 0115.';
