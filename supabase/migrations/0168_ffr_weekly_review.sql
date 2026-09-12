-- ===========================================================================
-- 0168 — THE FFR IS REVIEWED WEEKLY, and the review is recorded.
--
-- The user's ask (2026-09-12) with the Google Form it replaces: "The FFR gets
-- reviewed every week and I should have the provision to update certain fields
-- as part of review." The form updates Problem Status, Service Dept
-- Observation, the three CAPA columns, FFR Status and an attachment — keyed on
-- the UCN and the FFR number.
--
-- Two columns the register did not have:
--
--  * THE ATTACHMENT. The form's "Attachment(if any)" points at a Drive folder;
--    this holds the link and the file's name, the way the call's supporting
--    documents do. The file itself stays in Drive — this application does not
--    hold files, and starting now would be a decision rather than a column.
--
--  * WHEN IT WAS LAST REVIEWED. The whole point of a weekly cycle is knowing
--    which reports have not been looked at this week, and that cannot be read
--    off `updated_at` — any edit moves that. Stamped only by the review.
-- ===========================================================================

alter table public.field_failure_reports
  add column if not exists attachment_url    text not null default '',
  add column if not exists attachment_name   text not null default '',
  add column if not exists reviewed_at       date,
  add column if not exists reviewed_by_name  text not null default '';

comment on column public.field_failure_reports.reviewed_at is
  'The weekly FFR review. NOT updated_at: any edit moves that, and the question is which reports have not been looked at.';

create index if not exists ffr_reviewed_idx on public.field_failure_reports (reviewed_at nulls first);

-- 'Cancelled' joins Open and Closed on the form. A cancelled report is still a
-- record — it is not deleted, it is marked (0049's rule), which is exactly what
-- this status is for.
--
-- No CHECK constraint, deliberately: 0152 is the precedent. A CHECK on a
-- vocabulary column aborted a bulk load PART-WRITTEN when a value outside it
-- appeared, leaving a half-updated table. A word the list does not know now
-- lands in the data and shows on the register as itself, which is how somebody
-- notices, rather than the row never arriving.

-- ---------------------------------------------------------------------------
-- THE VIEW IS DROPPED AND REBUILT, not replaced.
--
-- `create or replace view` can only APPEND columns, and this one selects `f.*`
-- — so the four columns added above arrive in the MIDDLE of its output, before
-- live_call_status. The replace fails with "cannot change name of view column",
-- which is precisely what happened here on the first apply.
--
-- Nothing depends on this view but the register screen, so dropping it costs
-- nothing. security_invoker is re-asserted below because a rebuilt view does
-- not keep it — the fault 0040/0050/0057 shipped three times, each time handing
-- every row to every signed-in user.
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

-- ---------------------------------------------------------------------------
-- THE REVIEW STAMP. Who reviewed it is the database's to say, as the raiser is
-- (0165) and as a call's registrant is (0113). `reviewed_at` is only moved when
-- the caller actually sets it, so an ordinary edit to a report does not make it
-- look reviewed.
-- ---------------------------------------------------------------------------
create or replace function public.ffr_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.raised_by := coalesce(auth.uid(), new.raised_by);
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
