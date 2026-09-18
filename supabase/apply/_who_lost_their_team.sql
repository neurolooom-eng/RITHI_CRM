-- ===========================================================================
-- WHO SEES NO TEAM NOW THAT 0212 IS IN?
--
-- READ-ONLY. Paste into the Supabase SQL editor and run. No editing needed.
--
-- RUN THIS ONCE, STRAIGHT AFTER user_directory.sql. 0212 closed a leak by
-- refusing to walk the reporting tree from a BLANK name, and that fix only ever
-- narrows. Anybody whose own `user_directory` row has an empty `name` was
-- previously absorbing every person with no manager recorded; they now see no
-- team at all.
--
-- THAT IS THE CORRECT ANSWER and it is also a change somebody will notice. The
-- directory does not say who they are, so it cannot say who reports to them —
-- and they still see their own calls and their own spare requests, because
-- those match on user id and email rather than on name.
--
-- THE REMEDY IS THE DIRECTORY, NOT THE CODE. Put the person's name into their
-- User Master row, spelled exactly as it appears in their team's
-- `reporting_manager` / `regional_manager` columns, and their team comes back
-- immediately — no SQL, no deploy.
--
-- AN EMPTY RESULT IS THE GOOD ANSWER: nobody was relying on the blank match,
-- and 0212 changed what nobody could see.
-- ===========================================================================
-- ONLY THE PEOPLE 0212 ACTUALLY CHANGED. A person with NO directory row had no
-- team before the fix either -- their root never matched anything -- so listing
-- them here would report somebody as affected who is not, which is the same
-- fault as a status row answering NO for nothing. The set that changed is:
-- a directory row EXISTS, and its Name is blank.
select
  coalesce(nullif(btrim(p.full_name), ''), p.email)            as person,
  p.email,
  coalesce(nullif(btrim(p.role), ''), '(no role)')             as role,
  'their User Master Name is blank — fill it in and their team returns'
                                                               as what_to_do,
  (select count(*) from public.user_directory x
    where btrim(coalesce(x.reporting_manager, '')) = ''
      and btrim(coalesce(x.regional_manager, '')) = '')::text   as rows_they_used_to_absorb
  from public.profiles p
  join public.user_directory d
    on lower(d.email) = lower(p.email) or lower(d.gmail) = lower(p.email)
 where coalesce(p.active, true)
   and btrim(coalesce(d.name, '')) = ''
 order by 1;
