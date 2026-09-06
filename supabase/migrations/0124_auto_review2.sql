-- ===========================================================================
-- REVIEW 2 ANSWERS ITSELF THE MORNING AFTER, AND NOT BEFORE.
--
-- The user's rule (2026-09-06): "if a call is logged Today, Review 2 should be
-- marked as No tomorrow. It should still be pending for review today; it can be
-- marked as No the next day - 9:15 am. During Review 3, I will change it if
-- need be."
--
-- So there are TWO conditions, and the second is the one that is easy to lose:
--   * the call was logged BEFORE today — a call logged today stays pending all
--     day, because today is when somebody is supposed to look at it;
--   * it is 9:15 am or later. Before that, the day has not started and nothing
--     is marked. The check lives in the FUNCTION, not only in the schedule, so
--     the answer is the same whoever calls it and however often.
--
-- Both are measured in Asia/Kolkata. The database's `current_date` is UTC, and
-- at 9:15 in India that is still the previous day for part of the year's worth
-- of edge cases; "today" here has to mean the reviewer's today.
--
-- WHAT IT DOES NOT TOUCH
--
--   * A call that failed inside its FIRST YEAR (age < 366 days). That is the
--     user's own rule from bulk Review 2 (0119) and it applies with more force
--     here, not less: Review 2 asks whether this was a warranty failure, so a
--     machine that failed in its first year is precisely the case the question
--     exists for. A clock must not answer it.
--   * A call whose age at failure is UNKNOWN — no warranty start, so no age.
--     "Not known to be inside its first year" is not "known to be outside it",
--     and this is a quality record.
--   * A Review 2 somebody has already answered. It fills in what is blank.
--
-- The held-back ones are COUNTED and returned, so the number of calls the
-- automation is deliberately leaving for a person is a figure somebody can
-- look at rather than a silence.
--
-- WHO ANSWERED IT is recorded as 'Auto (9:15 am)' in review2_by, so Review 3
-- can tell an automatic NO from one a reviewer gave — which is the whole basis
-- on which the user said they would change it if need be.
--
-- THE FIRST RUN CLEARS THE BACKLOG. Every call still pending Review 2 that was
-- logged before today and failed outside its first year is answered in that one
-- run, however far back it goes. That is what automating it means, but it is a
-- bulk write to a quality record and it happens the moment this file is
-- applied — so it is said here rather than discovered afterwards.
--
-- TO UNDO IT, all of it or one day of it, the marker is the whole point:
--
--   update public.call_reviews
--      set risk_to_patient = '', warranty_failure = '', frequent_failure = '',
--          review2_by = '', review2_at = null
--    where review2_by = 'Auto (9:15 am)';        -- add: and review2_at = date '...'
--
-- Nothing a person answered carries that marker, so nothing a person answered
-- can be caught by it.
-- ===========================================================================

-- TESTABLE AT A FIXED MOMENT, AND ONLY FROM INSIDE. The rule is entirely about
-- what time it is, so it is split in two: a worker that takes the moment, and
-- the entry point that supplies the real one. The worker is granted to NOBODY
-- — no signed-in caller can hand it a clock and mark today's calls early.

create or replace function public.auto_answer_review2_asof(p_asof timestamptz)
returns table (marked integer, held_first_year integer, held_unknown_age integer, ran boolean, note text)
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (p_asof at time zone 'Asia/Kolkata')::date;
  v_time  time := (p_asof at time zone 'Asia/Kolkata')::time;
  n_ok    integer := 0;
  n_year  integer := 0;
  n_age   integer := 0;
begin
  if v_time < time '09:15' then
    return query select 0, 0, 0, false, 'before 9:15 am — nothing is marked yet today'::text;
    return;
  end if;

  -- Everything still pending that was logged before today. `reg_at` is the
  -- registration timestamp where there is one (0050); `reg_date` is the date
  -- the call is filed under, and is what the register has always shown.
  with pending as (
    select c.ucn,
           coalesce(c.call_number, '') as call_number,
           (coalesce(c.complaint_date, c.reg_date) - c.warranty_start)::int as age_at_failure
      from public.field_calls c
      left join public.call_reviews r on r.ucn = c.ucn
     where coalesce((c.reg_at at time zone 'Asia/Kolkata')::date, c.reg_date) < v_today
       and not coalesce(r.review2_done, false)
  ),
  held as (
    select count(*) filter (where age_at_failure is not null and age_at_failure < 366) as first_year,
           count(*) filter (where age_at_failure is null)                              as unknown_age
      from pending
  ),
  done as (
    insert into public.call_reviews as cr
      (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, review2_by)
    select p.ucn, p.call_number, 'NO', 'NO', 'NO', 'Auto (9:15 am)'
      from pending p
     where p.age_at_failure is not null and p.age_at_failure >= 366
    on conflict (ucn) do update
       set risk_to_patient  = excluded.risk_to_patient,
           warranty_failure = excluded.warranty_failure,
           frequent_failure = excluded.frequent_failure,
           review2_by       = excluded.review2_by
     where not coalesce(cr.review2_done, false)
    returning 1
  )
  select (select count(*) from done), h.first_year, h.unknown_age
    into n_ok, n_year, n_age
    from held h;

  return query select n_ok, n_year, n_age, true,
    (case when n_ok = 0 then 'nothing was waiting'
          else n_ok || ' answered No' end
     || case when n_year + n_age > 0
             then format('; %s left for a person (%s failed inside the first year, %s with no age on record)',
                         n_year + n_age, n_year, n_age)
             else '' end)::text;
end $$;

-- Nobody may call the worker directly: it is the one place a clock could be
-- handed in, and the entry point below is the only caller.
revoke all on function public.auto_answer_review2_asof(timestamptz) from public;

create or replace function public.auto_answer_review2()
returns table (marked integer, held_first_year integer, held_unknown_age integer, ran boolean, note text)
language plpgsql security definer set search_path = public as $$
begin
  -- Called by pg_cron there is no signed-in user, and the schedule IS the
  -- authority. Called from a screen there is one, and it must be somebody who
  -- could have given the answer by hand.
  if auth.uid() is not null and not public.has_perm('review.edit') then
    raise exception 'RBAC: your role cannot complete the daily call review';
  end if;
  return query select * from public.auto_answer_review2_asof(now());
end $$;

revoke all on function public.auto_answer_review2() from public;
grant execute on function public.auto_answer_review2() to authenticated;

comment on function public.auto_answer_review2() is
  'Marks Review 2 as No for every call logged BEFORE today, from 9:15 am Asia/Kolkata. Never touches a first-year failure, a call whose age at failure is unknown, or a Review 2 already answered; records itself as "Auto (9:15 am)" so Review 3 can tell.';

-- ---------------------------------------------------------------------------
-- Daily at 09:15 Asia/Kolkata = 03:45 UTC. Same guarded shape as 0033: enable
-- pg_cron if we can, say so plainly if we cannot, and never fail the migration
-- over it — the register calls the same function when it loads, so the rule
-- still applies on a project without pg_cron. It just applies when somebody
-- opens the screen rather than at a quarter past nine.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'Could not enable pg_cron automatically (%). Enable it in Dashboard -> Database -> Extensions, then re-run this file.', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'auto-answer-review2') then
      perform cron.unschedule('auto-answer-review2');
    end if;
    perform cron.schedule('auto-answer-review2', '45 3 * * *', 'select public.auto_answer_review2();');
    raise notice 'Scheduled auto-answer-review2 at 03:45 UTC = 09:15 Asia/Kolkata.';
  else
    raise notice 'pg_cron is not enabled. Review 2 will still auto-answer, but only when somebody opens the Daily Call Review after 9:15 am. Enable pg_cron (Dashboard -> Database -> Extensions) and re-run this file for the scheduled run.';
  end if;
exception when others then
  raise notice 'Could not schedule auto-answer-review2 (%). The register calls the same function on load, so the rule still applies.', sqlerrm;
end $$;
