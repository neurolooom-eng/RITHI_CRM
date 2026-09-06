-- ===========================================================================
-- ANSWER REVIEW 2 FOR MANY CALLS AT ONCE — EXCEPT THE ONES THAT MATTER MOST.
--
-- The user's rule (2026-09-06): "If the Age at failure is less than 366, then
-- it has to be done 1 by 1. If it is not, then it can be bulk set."
--
-- That rule is the whole point of the function, not a caveat on it. Review 2
-- asks whether a failure was a WARRANTY FAILURE (1 yr) — so a machine that
-- failed inside its first year is precisely the case the question exists for,
-- and precisely the one nobody should answer forty at a time. Everything older
-- is the routine bulk of the register, and clicking NO three times on each of
-- them is the work this removes.
--
-- ENFORCED HERE, not only on the screen. The client hides those rows from the
-- selection, but a hidden checkbox is a convenience and this is a quality
-- record: the rule has to hold against anything that can reach the API.
--
-- AN UNKNOWN AGE IS ALSO DONE ONE BY ONE. A machine with no warranty start has
-- no age, and "not known to be inside its first year" is not the same as
-- "known to be outside it". Answering "not a warranty failure" in bulk for a
-- machine whose age nobody can state is the one direction that cannot be
-- defended afterwards. If that turns out to exclude too much of the register,
-- it is one line to change — but it should be changed deliberately, with the
-- numbers in front of somebody.
--
-- IT DOES NOT OVERWRITE AN ANSWER. A call whose Review 2 is already complete
-- is skipped: bulk is for clearing what is pending, and silently rewriting a
-- judgement somebody already made is not something a button should do.
--
-- Like the spare batches (0116/0118), it SKIPS and COUNTS rather than failing:
-- a selection of two hundred that stops on the first ineligible one is a
-- selection you then take apart by hand.
-- ===========================================================================

create or replace function public.bulk_set_review2(
  p_ucns     text[],
  p_risk     text,
  p_warranty text,
  p_frequent text,
  p_by       text default ''
)
returns table (updated integer, skipped integer, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_ucn   text;
  v_age   integer;
  v_done  boolean;
  v_by    text := nullif(btrim(coalesce(p_by, '')), '');
  n_ok    integer := 0;
  n_skip  integer := 0;
  why     text[]  := '{}';
begin
  if not public.has_perm('review.edit') then
    raise exception 'RBAC: your role cannot complete the daily call review';
  end if;
  if p_ucns is null or array_length(p_ucns, 1) is null then
    raise exception 'Nothing selected';
  end if;
  -- All three, or it is not an answer to Review 2.
  if btrim(coalesce(p_risk, '')) = '' or btrim(coalesce(p_warranty, '')) = ''
     or btrim(coalesce(p_frequent, '')) = '' then
    raise exception 'Review 2 needs all three answers';
  end if;

  v_by := coalesce(v_by, public.my_dir_name(), auth.email(), '');

  foreach v_ucn in array p_ucns loop
    -- The SAME age 0047 shows on the screen: from the complaint (falling back
    -- to registration) to the machine's warranty start. Computed here rather
    -- than trusted from the caller — the caller is what this is guarding.
    select (coalesce(c.complaint_date, c.reg_date) - c.warranty_start)::int
      into v_age
      from public.field_calls c where c.ucn = v_ucn;

    if not found then
      n_skip := n_skip + 1; why := array_append(why, 'no such call'); continue;
    end if;

    if v_age is null then
      n_skip := n_skip + 1;
      why := array_append(why, 'age at failure not known — review it one by one');
      continue;
    end if;

    if v_age < 366 then
      n_skip := n_skip + 1;
      why := array_append(why, 'failed within the first year — review it one by one');
      continue;
    end if;

    select r.review2_done into v_done from public.call_reviews r where r.ucn = v_ucn;
    if coalesce(v_done, false) then
      n_skip := n_skip + 1; why := array_append(why, 'Review 2 already answered'); continue;
    end if;

    -- review2_at and the derived columns are the table's own business
    -- (call_reviews_stamp); this sets the answers and who gave them.
    insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, review2_by)
    select v_ucn, coalesce(c.call_number, ''), btrim(p_risk), btrim(p_warranty), btrim(p_frequent), v_by
      from public.field_calls c where c.ucn = v_ucn
    on conflict (ucn) do update
       set risk_to_patient  = excluded.risk_to_patient,
           warranty_failure = excluded.warranty_failure,
           frequent_failure = excluded.frequent_failure,
           review2_by       = excluded.review2_by;

    n_ok := n_ok + 1;
  end loop;

  return query select n_ok, n_skip,
    coalesce((select string_agg(w, '; ') from (select distinct unnest(why) as w) d), '');
end $$;
revoke all on function public.bulk_set_review2(text[], text, text, text, text) from public;
grant execute on function public.bulk_set_review2(text[], text, text, text, text) to authenticated;

comment on function public.bulk_set_review2(text[], text, text, text, text) is
  'Answer Review 2 for many calls at once. REFUSES a call that failed inside its first year (age < 366 days) or whose age is unknown — those are reviewed one by one — and never overwrites a Review 2 already answered.';
