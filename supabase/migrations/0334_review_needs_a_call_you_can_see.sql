-- ===========================================================================
-- 0334 — A REVIEW IS WRITTEN ONLY ON A CALL THAT EXISTS AND THAT THE REVIEWER
--        CAN SEE  (second re-review, 2026-10-03: D-128)
--
-- call_reviews_write (0044) is FOR ALL on has_perm('review.edit') alone, with
-- no test that the call exists or that the writer may see it. Measured as an
-- RM: a review on another team's call he could not see, and one on UCN
-- NO-SUCH-CALL, were both accepted, and each raised a Field Failure Report
-- naming the RM as its raiser (zz_ffr_from_review fires on the write).
--
-- THE NEW TEST: the call is read through `calls`, which is security_invoker,
-- so the CALL policies decide (has_perm('calls.view') and the visibility rule):
-- the call must exist AND be one the writer can see. That is exactly the set
-- the Daily Complaint Review and the review drawer list, so no reviewer loses a
-- call they can open today.
--
-- WHAT KEEPS WORKING:
--   * The DCCR Register upload (Bulk Uploads) writes reviews of history, some
--     for calls not loaded yet; a holder of bulk.upload keeps the old rule.
--   * The automatic Review 2, the bulk Review 2 and the reviewer back-fill are
--     SECURITY DEFINER functions (auto_answer_review2_asof, bulk_set_review2,
--     ffr_reviewer_backfill) and do not pass through this policy at all.
--
-- NOT CHANGED HERE: call_reviews_read is still every signed-in user. Narrowing
-- what people READ changes counts on screens and is left for its own change;
-- D-128 records it as the remaining half.
--
-- Both predicates are wrapped in (select ...) so they are asked once per
-- statement, not once per row (the 0250 lesson).
-- ===========================================================================

drop policy if exists call_reviews_write on public.call_reviews;
create policy call_reviews_write on public.call_reviews
  for all
  using (
    (select public.has_perm('review.edit'))
    and ((select public.has_perm('bulk.upload'))
         or exists (select 1 from public.calls c where c.ucn = call_reviews.ucn))
  )
  with check (
    (select public.has_perm('review.edit'))
    and ((select public.has_perm('bulk.upload'))
         or exists (select 1 from public.calls c where c.ucn = call_reviews.ucn))
  );
