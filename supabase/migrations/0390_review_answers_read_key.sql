-- ===========================================================================
-- 0390 — DAILY COMPLAINT REVIEW ANSWERS ARE READ BY THOSE GIVEN THE KEY
--        (second re-review D-129, the open half; the user, 2026-10-05)
--
-- call_reviews_read (0044) is auth.role() = 'authenticated': every signed-in
-- user read every call's review -- the risk-to-patient answer and the root
-- cause -- including calls they cannot otherwise see.
-- THE USER'S DECISION: "It should be visible only to a selected few as set
-- through roles & permissions", by "a new key, given to today's editors":
--   * review.view ("Read Daily Complaint Review answers") is the read key;
--     review.edit is its parent (an editor reads what they edit);
--   * ONCE, it is merged into every role whose stored permissions hold
--     review.edit, so nobody who works the register loses it on the day; the
--     administrator then ticks or unticks it per role, or per person in Extra
--     Access. A role with an EMPTY set (not configured) is left alone.
-- The views over the table (field_call_review, field_call_review_summary,
-- field_failure_register) are security_invoker, so for a reader without the
-- key the review columns come back empty -- the screens say so.
-- In the daily_review module, after 0353.
-- ===========================================================================

insert into public.perm_parents (child, parent) values ('review.view', 'review.edit')
on conflict do nothing;

drop policy if exists call_reviews_read on public.call_reviews;
create policy call_reviews_read on public.call_reviews for select
  using ((select public.has_perm('review.view')));

-- 0318's definition VERBATIM (see 0369).
create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

do $$
declare n bigint;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0390_review_view_to_editors') then return; end if;
  update public.app_roles
     set permissions = permissions || '["review.view"]'::jsonb
   where jsonb_array_length(coalesce(permissions, '[]'::jsonb)) > 0
     and permissions ? 'review.edit'
     and not (permissions ? 'review.view');
  get diagnostics n = row_count;
  insert into public.one_time_fixes_done (name, detail)
  values ('0390_review_view_to_editors', n || ' role(s) holding review.edit given review.view');
  raise notice '0390: % role(s) holding review.edit given review.view', n;
end $$;
