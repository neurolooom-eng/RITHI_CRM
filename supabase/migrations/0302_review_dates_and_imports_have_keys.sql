-- ===========================================================================
-- CORRECTING A REVIEW DATE AND MARKING A REVIEW IMPORTED HAVE KEYS OF THEIR OWN.
-- WHAT WAS AN ADMINISTRATOR'S ALONE IS A KEY (the user, 2026-09-30: "All
-- Admin Actions that are greyed out now should be editable from the Role &
-- Permissions. Only the Admin Role should be Greyed out not the Actions.")
--
-- is_admin() becomes has_perm(<key>). An administrator still passes -- has_perm()
-- answers true for is_admin() -- so nobody loses anything, and NOBODY ELSE GAINS
-- ANYTHING ON THE DAY: no role holds the new key until an administrator ticks it
-- on Roles & Permissions. coalesce(..., false) so a NULL (no session) refuses.
--
-- Two rules in call_review_markers(), which runs FIRST among the review's
-- before-triggers (a_): the `imported` marker now needs bulk.upload (the key
-- for the upload that sets it), and the three completion dates now need
-- review.correct_date -- which the screen alone enforced before (D-020): any
-- holder of review.edit could back-date a review through the API. Review 1's
-- date is not stored on the review (it is derived), so only Review 2 and 3's
-- are guarded.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.call_review_markers()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.review2_auto := case when tg_op = 'UPDATE' then old.review2_auto else false end;
    if coalesce(new.imported, false) and not coalesce(public.has_perm('bulk.upload'), false) then
      new.imported := case when tg_op = 'UPDATE' then old.imported else false end;
    end if;
    -- A REVIEW'S COMPLETION DATE IS CHANGED ONLY WITH review.correct_date
    -- (FRS-106.3, D-020: it was administrator-only on the screen alone, and
    -- any holder of review.edit could back-date a review through the API).
    -- REFUSED, as FRS-106.3 says -- a date is what a reviewer is held to, and
    -- one quietly dropped would read as saved. Only a CHANGE is refused: the
    -- screen sends an unchanged date back untouched, and call_review_stamp()
    -- still stamps an empty one when its stage completes. An imported review
    -- loaded by a holder of bulk.upload carries its file's dates.
    if not coalesce(public.has_perm('review.correct_date'), false)
       and not (coalesce(new.imported, false) and coalesce(public.has_perm('bulk.upload'), false)) then
      if (tg_op = 'UPDATE' and (new.review2_at is distinct from old.review2_at
                                or new.review3_at is distinct from old.review3_at))
         or (tg_op = 'INSERT' and (new.review2_at is not null or new.review3_at is not null)) then
        raise exception 'RBAC: changing the date a review was completed needs "Correct the date a review was completed"';
      end if;
    end if;
  end if;
  return new;
end $function$;
