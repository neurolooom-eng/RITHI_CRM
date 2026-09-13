-- ===========================================================================
-- 0179 — THE FIELD FAILURE REGISTER GOES BACK TO 2016, AND THE YEARS DISAGREE.
--
-- The user, 2026-09-13: "I want Provision to upload FFR Data from 2016 -- I
-- think every year it has a Different Format -- But it needs to be able to
-- merge all into 1 Table."
--
-- The importer itself is the Bulk Uploads definition (src/lib/uploads.ts): it
-- maps whatever headers a year's sheet carries onto this table and keeps
-- everything it does not recognise in `extra`, so a format nobody predicted
-- loses nothing. This file is the two things that have to be TRUE IN THE
-- DATABASE for that to be safe.
--
-- 1. MIGRATED DATA STAYS DISTINGUISHABLE (URS-037 in the validation package:
--    "migrated data must stay DISTINGUISHABLE from the system's own, and a
--    figure derived from both must report the split"). A 2016 report and one
--    this system raised last week are both quality records, but they are not
--    the same KIND of evidence — one was typed into a spreadsheet by somebody
--    long gone, the other was raised by a rule and carries its own history.
--    `imported_from` names the file a row came in from; empty means this system
--    raised it. A real column rather than a flag in `extra`, because the point
--    of it is to FILTER and to COUNT.
--
-- 2. AN IMPORT DOES NOT CLAIM TO HAVE RAISED THE REPORT. ffr_stamp() sets
--    `raised_by` from auth.uid() on insert — right for a report raised here,
--    WRONG for a 2016 record, where it would name whoever ran the upload as the
--    person who raised a failure report nine years before they touched it. The
--    sheet's own "Raised by" still lands in raised_by_name, which is what the
--    document prints; the uuid is left null, because there is no user account
--    behind that name and inventing a link is worse than admitting there is
--    none.
-- ===========================================================================

alter table public.field_failure_reports
  add column if not exists imported_from text not null default '';

comment on column public.field_failure_reports.imported_from is
  'The file this report was loaded from. EMPTY means this system raised it. Kept so a figure over the register can report the split (URS-037) — a 2016 sheet row and a report raised by the Daily Call Review are not the same kind of evidence.';

create index if not exists ffr_imported_idx on public.field_failure_reports (imported_from);

-- ---------------------------------------------------------------------------
-- THE STAMP, with one exception it did not have.
-- ---------------------------------------------------------------------------
create or replace function public.ffr_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- AN IMPORTED ROW IS NOT RAISED BY THE PERSON IMPORTING IT. Everything else
    -- about the stamp is unchanged.
    if coalesce(btrim(new.imported_from), '') = '' then
      new.raised_by := coalesce(auth.uid(), new.raised_by);
    else
      new.raised_by := null;
    end if;
    if coalesce(btrim(new.ffr_no), '') = '' then
      new.ffr_no := public.next_ffr_no();
    end if;
  else
    -- The number is the record's identity: issued once, never edited.
    new.ffr_no := old.ffr_no;
    new.raised_by := old.raised_by;
    -- A weekly review is a DATE somebody set, not a side effect of saving.
    if new.reviewed_at is distinct from old.reviewed_at and new.reviewed_at is not null then
      new.reviewed_by_name := coalesce(nullif(btrim(new.reviewed_by_name), ''), new.reviewed_by_name);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- A NOTE ON THE NUMBER, because it is the thing most likely to go wrong and it
-- needs no code: next_ffr_no(p_yr) takes the highest number ALREADY ISSUED FOR
-- THAT YEAR, so loading 2016–2025 cannot disturb the 2026 counter, and loading
-- more 2026 rows correctly pushes it past them. The import supplies each
-- sheet's own number, and ffr_stamp leaves a supplied number alone.
--
-- AND ON RE-RUNNING ONE: the upload matches on `ffr_no`, which is UNIQUE, so a
-- corrected sheet updates those reports rather than adding them again. The
-- change log (0174) writes only what actually differs, so re-loading an
-- unchanged file records nothing.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- THE REGISTER VIEW IS DROPPED AND REBUILT, and that is forced rather than
-- chosen. `field_failure_register` selects `f.*`, so a column added to the
-- table arrives in the MIDDLE of its output — before live_call_status — and
-- `create or replace view` can only APPEND. On a replay of this module the
-- rebuild in 0167/0168 then fails outright:
--
--   ERROR: cannot change name of view column "live_call_status" to "imported_from"
--
-- Found by check:replay, which is the only thing that would have: the migration
-- applies perfectly well to a database built in order, and breaks only when the
-- bundle is replayed onto one that already has the view. 0168 hit the same wall
-- adding four columns and took the same route.
--
-- security_invoker is re-asserted below, because a rebuilt view does NOT keep
-- it — the fault 0040/0050/0057 shipped three times, each time handing every
-- report to every signed-in user.
-- ---------------------------------------------------------------------------
drop view if exists public.field_failure_register;
create view public.field_failure_register as
select
  f.*,
  c.open_state                      as live_call_status,
  c.last_visit_at                   as live_last_visit_at,
  c.allocated_to                    as live_engineer,
  c.party_name                      as live_customer_name,
  c.item_status                     as live_cover,
  (select count(*) from public.reports rp where rp.ucn = f.ucn)            as live_visit_count,
  (select coalesce(string_agg(distinct btrim(s.part), ', '), '')
     from public.spare_consumption s
    where s.ucn = f.ucn and coalesce(s.qty, 0) > 0)                        as live_spares_consumed,
  r.any_potential_effect            as live_any_potential_effect,
  r.risk_to_patient                 as live_risk_to_patient,
  r.warranty_failure                as live_warranty_failure,
  r.frequent_failure                as live_frequent_failure,
  r.complaint_grouping              as live_complaint_grouping,
  r.root_cause_keyword              as live_root_cause_keyword,
  r.spare_category                  as live_spare_category,
  r.review2_at                      as live_review2_at,
  r.review3_done                    as live_review3_done
from public.field_failure_reports f
left join public.calls c        on c.ucn = f.ucn
left join public.call_reviews r on r.ucn = f.ucn;

alter view public.field_failure_register set (security_invoker = on);
grant select on public.field_failure_register to authenticated;
