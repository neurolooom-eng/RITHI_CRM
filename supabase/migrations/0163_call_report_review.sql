-- ===========================================================================
-- 0163 — CALL REVIEW: has the closed call's report been looked at?
--
-- A SECOND review, and deliberately not the Daily Call Review (the user,
-- 2026-09-11: "This is different from the Daily Call Review"). The DCCR asks
-- what the failure WAS — complaint grouping, root cause, frequent failure. This
-- one asks whether the REPORT the engineer filed is fit to stand: it lists only
-- SOLVED calls, and the reviewer can do three things about one —
--
--   * book a spare the engineer did not (a Reconciliation consumption line,
--     which is what "Reco" is throughout this codebase),
--   * re-open the call, if the report does not close it,
--   * or mark it "Report Reviewed" and move on.
--
-- ONE ROW PER CALL, not a history: the question is a state ("has this been
-- reviewed?"), and the row carries who and when. Re-reviewing a call that was
-- re-opened and closed again overwrites the same row, and `reviewed_at` says
-- when it was last looked at. `status` is a text column rather than a boolean
-- because "Report Reviewed" is a phrase people will want more of later
-- (Returned to Engineer, Reviewed with Observation); a boolean would have to be
-- migrated to add the second one.
-- ===========================================================================

create table if not exists public.call_report_reviews (
  ucn              text primary key,
  status           text not null default 'Report Reviewed',
  remarks          text not null default '',
  reviewed_by      uuid,
  reviewed_by_name text not null default '',
  reviewed_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.call_report_reviews is
  'Call Review (/call-review): has this solved call''s report been reviewed. One row per UCN.';

create index if not exists call_report_reviews_status_idx
  on public.call_report_reviews (status);

alter table public.call_report_reviews enable row level security;

-- WHO the reviewer was is the database's to say, exactly as it is on a call
-- (0113): a caller-supplied id is discarded. A review record naming somebody
-- who did not do the reviewing is worse than one naming nobody.
create or replace function public.call_report_reviews_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
  new.reviewed_at := now();
  new.updated_at  := now();
  return new;
end $$;

drop trigger if exists zz_call_report_reviews_stamp on public.call_report_reviews;
create trigger zz_call_report_reviews_stamp
  before insert or update on public.call_report_reviews
  for each row execute function public.call_report_reviews_stamp();

-- READ follows the call: anyone who may see the call may see whether it has
-- been reviewed. Written as an EXISTS over the `calls` view so the whole
-- visibility stack (office roles, the reporting tree, the engineer's own calls)
-- applies without being restated here and drifting from it.
drop policy if exists crr_read on public.call_report_reviews;
create policy crr_read on public.call_report_reviews for select to authenticated
  using (exists (select 1 from public.calls c where c.ucn = call_report_reviews.ucn));

-- WRITE needs the right, and the same visibility: marking a call you cannot
-- see is not a review.
drop policy if exists crr_write on public.call_report_reviews;
create policy crr_write on public.call_report_reviews for insert to authenticated
  with check (public.has_perm('callreview.mark')
          and exists (select 1 from public.calls c where c.ucn = call_report_reviews.ucn));

drop policy if exists crr_update on public.call_report_reviews;
create policy crr_update on public.call_report_reviews for update to authenticated
  using (public.has_perm('callreview.mark')
     and exists (select 1 from public.calls c where c.ucn = call_report_reviews.ucn))
  with check (public.has_perm('callreview.mark'));

-- A review is a quality record: it is corrected by re-marking, never deleted.
drop policy if exists crr_delete on public.call_report_reviews;

grant select, insert, update on public.call_report_reviews to authenticated;

-- ---------------------------------------------------------------------------
-- THE RIGHTS. Merged into whatever each role already holds, never overwritten:
-- an administrator may have tuned these, and an overwrite is how a role loses
-- everything else it was given.
--
-- The PAGE goes to all six roles the user named. The ACTION does not go to
-- Technical Support or Zoho Migration: what makes those two read-only is what
-- they do NOT hold (0145/0155), and quietly granting a write here would undo
-- that for every future reader of the matrix. One tick on Roles & Permissions
-- grants it if that is wanted — which is the point of it being a permission.
-- ---------------------------------------------------------------------------
update public.app_roles
   set permissions = (
         select jsonb_agg(distinct p)
           from jsonb_array_elements(coalesce(permissions, '[]'::jsonb) || '["mod:/call-review"]'::jsonb) as t(p))
 where role in ('admin', 'nsm', 'rm', 'hotline', 'zoho_migration', 'technical_support');

update public.app_roles
   set permissions = (
         select jsonb_agg(distinct p)
           from jsonb_array_elements(coalesce(permissions, '[]'::jsonb) || '["callreview.mark"]'::jsonb) as t(p))
 where role in ('admin', 'nsm', 'rm', 'hotline');
