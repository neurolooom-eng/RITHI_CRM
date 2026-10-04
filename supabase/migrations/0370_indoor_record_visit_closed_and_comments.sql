-- ===========================================================================
-- 0370 — record_indoor_visit() IS NOT A SIGNED-IN USER'S, AND THE INDOOR VISIT
--        COLUMNS SAY WHEN THE VISIT IS ACTUALLY FILED
--        (second re-review D-108, D-116)
--
-- D-108 -- 0327 stopped the engineer marking a unit's visit filed, but
-- record_indoor_visit() stayed executable by authenticated, and no screen calls
-- it (read: src/ -- only an unused wrapper names it). Measured: the DC's named
-- approver pointed a repair at a 200-day-old visit with it and approved; the DC
-- read Approved and nothing of this repair was filed. The approval files the
-- visit itself (approve_indoor_dc(), 0327), running as its owner, so it does
-- not need the grant. The function is KEPT for a repair in the SQL editor,
-- where its own checks still apply.
--
-- D-116 -- the column comments 0323 wrote say the visit is filed when the DC is
-- ISSUED and that create_indoor_dc() requires it; since 0327 the visit is filed
-- at APPROVAL and create_indoor_dc() asks neither. DATABASE_SCHEMA.md carries
-- the comments, so it said the same.
-- In the indoor module, after 0367.
-- ===========================================================================

revoke execute on function public.record_indoor_visit(bigint, text, boolean) from public, anon, authenticated;

comment on column public.indoor_jobs.visit_draft is
  'For a job with a UCN: the Visit Entry answers captured with the report upload, a DRAFT. Filed against the UCN when the Indoor DC is APPROVED -- by approve_indoor_dc(), as the approver (0327) -- not when it is issued.';
comment on column public.indoor_jobs.visit_uid is
  'The reports row (visit) filed against the UCN from this job''s draft, written by the DC''s approval (0327). Must name a visit of this job''s UCN; no signed-in write may change it.';
comment on column public.indoor_jobs.visit_filed_at is
  'When the drafted visit was filed in full -- the visit, its spares and its feedback -- by the DC''s approval (0327). create_indoor_dc() does not ask for it; approve_indoor_dc() files it.';
