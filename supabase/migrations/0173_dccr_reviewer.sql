-- ===========================================================================
-- 0173 — WHO REVIEWED IT, RECORDED BY THE DATABASE, AND CARRIED ONTO THE FFR.
--
-- The user, 2026-09-12: "In DCCR RECORD WHO is reviewing it and record their
-- name in FFR. For all old records update it to Bagyaraj."
--
-- THE HOLE. The screen already stamps `review2_by` / `review3_by` — but only
-- when somebody presses Save, and deliberately so (an automatic save must not
-- put a name against a judgement nobody has read). The Daily Call Review also
-- AUTO-SAVES, and there is a bulk "Review 2 for all" path, so a review could be
-- completed with no reviewer recorded at all. raise_ffr() then wrote
-- 'Daily Call Review' into the report's "Raised by" — which is the name of a
-- screen, not of a person, and "Raised by" on a quality record has to be a
-- person.
--
-- SO THE DATABASE SAYS WHO, exactly as it does for a call's registrant (0114):
-- the identity comes from auth.uid() at the moment the review is COMPLETED, and
-- a caller-supplied name cannot displace it. The client's own stamp is kept as
-- the DISPLAY name where it agrees; where the client said nothing, the
-- directory supplies the name for the uid.
--
-- WHY AT THE TRANSITION AND NOT ON EVERY WRITE: a review is edited and re-saved
-- for weeks afterwards. The person who ANSWERED it is the reviewer; the person
-- who corrected a spelling in March is not, and overwriting on every update
-- would quietly hand the record to whoever touched it last.
-- ===========================================================================

alter table public.call_reviews
  add column if not exists review2_by_uid uuid references auth.users (id),
  add column if not exists review3_by_uid uuid references auth.users (id);

comment on column public.call_reviews.review2_by_uid is
  'WHO completed Review 2, from auth.uid() at the moment it was completed. The text column beside it is the display name; this is the identity.';

-- ---------------------------------------------------------------------------
-- The stamp. A BEFORE trigger named to sort after 0044''s own stamper, which is
-- what sets review2_done / review3_done and their dates — this has to see the
-- values that trigger settles on, not the ones the client sent.
-- ---------------------------------------------------------------------------
create or replace function public.call_review_reviewer_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  -- OLD's generated columns are computed — the row exists — so these are read
  -- straight off it.
  was2 boolean := case when tg_op = 'UPDATE' then coalesce(old.review2_done, false) else false end;
  was3 boolean := case when tg_op = 'UPDATE' then coalesce(old.review3_done, false) else false end;
  -- NEW's ARE NOT, and that is not an oversight to work around later: PostgreSQL
  -- computes a GENERATED column AFTER the BEFORE triggers have run, so
  -- `new.review2_done` is NULL in here — always. The first version of this
  -- trigger read it and silently stamped nothing, on every path, which is
  -- exactly the fault it was written to fix.
  --
  -- So the completion test is evaluated from the SOURCE columns, mirroring
  -- 0044's generated expression WORD FOR WORD. A mirror is only safe while it
  -- stays a copy, so `check:ui` compares the two and fails on drift — the same
  -- discipline the apply bundles use for a duplicated definition.
  now2 boolean := btrim(new.risk_to_patient) <> '' and btrim(new.warranty_failure) <> '' and btrim(new.frequent_failure) <> '';
  now3 boolean := btrim(new.complaint_grouping) <> '' and btrim(new.root_cause_keyword) <> '' and btrim(new.spare_category) <> '';
begin
  -- No signed-in user: an import, a definer function or a scheduled job. There
  -- is no person to record, and inventing one is worse than leaving it empty.
  if v_uid is null then return new; end if;

  -- The directory name, which is the name the rest of the system knows this
  -- person by ("Call Allocated To" matches on it). profiles.full_name is the
  -- fallback for somebody not on the directory yet.
  select coalesce(nullif(btrim(d.name), ''), nullif(btrim(p.full_name), ''))
    into v_name
    from public.profiles p
    left join public.user_directory d
      on lower(btrim(d.email)) = lower(btrim(p.email))
      or lower(btrim(d.gmail)) = lower(btrim(p.email))
   where p.id = v_uid;

  if now2 and not was2 then
    new.review2_by_uid := v_uid;
    -- The client's own value wins when it sent one — it is what the reviewer
    -- saw on screen — and the directory fills the silence.
    new.review2_by := coalesce(nullif(btrim(coalesce(new.review2_by, '')), ''), coalesce(v_name, ''));
  end if;

  if now3 and not was3 then
    new.review3_by_uid := v_uid;
    new.review3_by := coalesce(nullif(btrim(coalesce(new.review3_by, '')), ''), coalesce(v_name, ''));
  end if;

  return new;
end $$;

-- `zzz_` so it runs after 0044's `zz_` stamper, which decides review2_done.
-- Triggers of the same kind fire in NAME order, and this one reads what that
-- one writes.
drop trigger if exists zzz_call_review_reviewer on public.call_reviews;
create trigger zzz_call_review_reviewer
  before insert or update on public.call_reviews
  for each row execute function public.call_review_reviewer_stamp();

-- ---------------------------------------------------------------------------
-- THE FFR TAKES THE REVIEWER'S NAME. Review 3 completes the observation, so its
-- reviewer is preferred where there is one; Review 2 is what RAISES the report
-- and is the fallback.
--
-- 'Daily Call Review' is gone as a last resort: a screen is not a person, and a
-- report that cannot name one is better left blank — blank is a question
-- somebody asks, a plausible-looking name is not.
-- ---------------------------------------------------------------------------
create or replace function public.raise_ffr(p_review public.call_reviews)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ucn  text := coalesce(nullif(btrim(p_review.ucn), ''), '');
  v_call record;
  v_date date;
  v_no   text;
  v_by   text;
begin
  if v_ucn = '' then return null; end if;
  if exists (select 1 from public.field_failure_reports f where f.ucn = v_ucn) then return null; end if;

  -- THE DATE OF THE FFR IS THE DATE REVIEW 2 WAS COMPLETED (the user's rule).
  v_date := coalesce(p_review.review2_at, (now() at time zone 'Asia/Kolkata')::date);
  -- …and therefore so is its YEAR. A 2025 review numbered /26 would be wrong on
  -- the face of the document.
  v_no := public.next_ffr_no((extract(year from v_date)::int % 100)::smallint);

  v_by := coalesce(
            nullif(btrim(coalesce(p_review.review3_by, '')), ''),
            nullif(btrim(coalesce(p_review.review2_by, '')), ''),
            '');

  -- The call, FROM THE BASE TABLES. Not the `calls` view: it is
  -- security_invoker, so inside a definer it would apply the CALLER's row
  -- policies — and a call this cannot see is a report it fails to raise,
  -- silently. Same reasoning 0125 gives for the UCN counter.
  select fc.reg_date, fc.party_name, fc.city, fc.product_name, fc.serial,
         fc.item_status, fc.call_type, fc.warranty_start,
         fc.complaint_reported, fc.standard_complaint,
         fc.open_state, fc.last_status, fc.last_visit_at
    into v_call
    from (
      select * from public.field_calls where ucn = v_ucn
      union all
      select * from public.installation_calls where ucn = v_ucn
      union all
      select * from public.pm_calls where ucn = v_ucn
    ) fc
   limit 1;

  insert into public.field_failure_reports (
    ffr_no, source, ucn, ffr_date, crn_date,
    customer_name, place, product_name, product_serial, cover, installation_date,
    problem_reported, service_observation, problem_status,
    visit_remarks, spares_consumed, current_call_status, call_solved_at, call_type,
    capa_responsibility, capa_no, capa_status, ffr_status,
    raised_by_name, extra
  )
  values (
    v_no, 'PC', v_ucn, v_date, v_call.reg_date,
    coalesce(v_call.party_name, ''), coalesce(v_call.city, ''),
    coalesce(v_call.product_name, ''), coalesce(v_call.serial, ''),
    coalesce(v_call.item_status, ''), v_call.warranty_start,
    coalesce(nullif(btrim(coalesce(v_call.complaint_reported, '')), ''),
             coalesce(v_call.standard_complaint, '')),
    coalesce(p_review.service_observation, ''),
    '',
    (select coalesce(string_agg(
              to_char(coalesce(rp.visit_at, rp.updated_at), 'DD-Mon-YYYY') || ' : ' ||
              coalesce(nullif(btrim(coalesce(rp.data->>'Job Done', '')), ''),
                       nullif(btrim(coalesce(rp.data->>'Complaint Observation', '')), ''), ''),
              E'\n' order by rp.visit_at desc nulls last, rp.id desc), '')
       from public.reports rp where rp.ucn = v_ucn),
    (select coalesce(string_agg(distinct btrim(s.part), ', '), '')
       from public.spare_consumption s
      where s.ucn = v_ucn and coalesce(s.qty, 0) > 0),
    coalesce(v_call.open_state, v_call.last_status, ''),
    v_call.last_visit_at,
    coalesce(v_call.call_type, ''),
    'No closed in FFR', 'NA', 'Not required', 'Open',
    v_by,
    jsonb_build_object(
      'raised_by_rule', 'any_potential_effect=YES',
      'risk_to_patient', coalesce(p_review.risk_to_patient, ''),
      'warranty_failure', coalesce(p_review.warranty_failure, ''),
      'frequent_failure', coalesce(p_review.frequent_failure, ''),
      'review2_at', p_review.review2_at,
      'review2_by', coalesce(p_review.review2_by, ''),
      'review3_by', coalesce(p_review.review3_by, ''))
  );

  return v_no;
end $$;

-- ---------------------------------------------------------------------------
-- THE OLD RECORDS, TO BAGYARAJ ("For all old records update it to Bagyaraj
-- (Match in user master for exact name)").
--
-- THE NAME IS LOOKED UP, NEVER TYPED. `user_directory` is User Master, and its
-- `name` is what "Call Allocated To" matches on across the whole system — so a
-- hand-typed "Bagyaraj" that differs from the master's spelling by a space or a
-- surname is a name no filter, count or report will ever match. The lookup is
-- case-insensitive on a prefix and takes the master's spelling VERBATIM.
--
-- AND IT CHANGES NOTHING IF HE IS NOT FOUND. A `do` block with a notice rather
-- than an update with a literal: if User Master has no such person, the right
-- outcome is that the records keep saying nothing and somebody fixes the
-- master, not that 40 quality records acquire a name that matches no user.
--
-- ONLY WHERE THERE IS NO PERSON NAMED. A report or a review that already
-- records who reviewed it is left exactly as it is — this fills silence, it
-- does not reassign work.
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
  v_ffr  integer;
  v_r2   integer;
  v_r3   integer;
begin
  select d.name into v_name
    from public.user_directory d
   where lower(btrim(d.name)) like 'bagyaraj%'
   order by length(d.name)
   limit 1;

  if v_name is null then
    raise notice 'Bagyaraj is not on User Master — old Field Failure Reports left without a reviewer. Add him to User Master and re-run this file.';
    return;
  end if;

  update public.field_failure_reports
     set raised_by_name = v_name
   where coalesce(btrim(raised_by_name), '') in ('', 'Daily Call Review');
  get diagnostics v_ffr = row_count;

  update public.call_reviews
     set review2_by = v_name
   where coalesce(review2_done, false)
     and coalesce(btrim(coalesce(review2_by, '')), '') = '';
  get diagnostics v_r2 = row_count;

  update public.call_reviews
     set review3_by = v_name
   where coalesce(review3_done, false)
     and coalesce(btrim(coalesce(review3_by, '')), '') = '';
  get diagnostics v_r3 = row_count;

  raise notice 'Reviewer set to "%": % field failure report(s), % Review 2, % Review 3.',
    v_name, v_ffr, v_r2, v_r3;
end $$;
