-- ===========================================================================
-- 0169 — RAISE THE FFRs THAT ARE ALREADY DUE ("as a 1 time activity — create
-- all the FFRs till date", 2026-09-12).
--
-- 0167 raises an FFR when a review is WRITTEN with Any Potential Effect = YES.
-- Every review already answered YES before that shipped has no report. This is
-- the catch-up, and three things had to change to make it safe:
--
--  1. THE NUMBER MUST BE IN THE REVIEW'S YEAR, not this one. next_ffr_no() read
--     the current year, so a 2025 review would have been numbered /26. It now
--     takes the year, defaulting to today's.
--
--  2. ONE CODE PATH. The trigger and the backfill must produce identical
--     records or the catch-up is a second, subtly different register. The
--     insert is now raise_ffr(), called by both.
--
--  3. A DRY RUN FIRST. The backfill reports what it WOULD create before it
--     creates anything, because nobody should discover the count afterwards —
--     and because the numbers it issues are permanent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The number, in a stated year. Dropping the old signature first: adding a
-- defaulted argument beside it would leave `next_ffr_no()` ambiguous between
-- two functions, and Postgres refuses that at the call site rather than here.
-- ---------------------------------------------------------------------------
drop function if exists public.next_ffr_no();

create or replace function public.next_ffr_no(p_yr smallint default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yr  smallint := coalesce(p_yr, (extract(year from (now() at time zone 'Asia/Kolkata')))::int % 100);
  v_max integer;
  v_no  integer;
begin
  -- The highest number already issued FOR THAT YEAR, however it got there —
  -- typed in, imported from the sheet, or handed out here. The shape test
  -- matters: a number that is not `FFR - nnn/yy` has nothing to compare, and a
  -- substring cast on one would raise rather than skip it.
  select coalesce(max(substring(ffr_no from 'FFR\s*-\s*([0-9]+)/')::int), 0)
    into v_max
    from public.field_failure_reports
   where ffr_no ~ ('^FFR\s*-\s*[0-9]+/' || lpad(v_yr::text, 2, '0') || '$');

  insert into public.ffr_counters (yr, last_no) values (v_yr, 0)
    on conflict (yr) do nothing;

  update public.ffr_counters
     set last_no = greatest(last_no, coalesce(v_max, 0)) + 1
   where yr = v_yr
  returning last_no into v_no;

  return 'FFR - ' || lpad(v_no::text, 3, '0') || '/' || lpad(v_yr::text, 2, '0');
end $$;

revoke all on function public.next_ffr_no(smallint) from public;
grant execute on function public.next_ffr_no(smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- RAISE ONE. The single definition of what an FFR made from a review contains;
-- the trigger and the backfill both call it, so the catch-up cannot quietly
-- differ from what the system produces from now on.
--
-- Returns the number issued, or NULL when there is already a report for that
-- call — which is what makes calling it twice harmless.
-- ---------------------------------------------------------------------------
create or replace function public.raise_ffr(p_review public.call_reviews)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ucn  text := coalesce(nullif(btrim(p_review.ucn), ''), '');
  v_call record;
  v_date date;
  v_no   text;
begin
  if v_ucn = '' then return null; end if;
  if exists (select 1 from public.field_failure_reports f where f.ucn = v_ucn) then return null; end if;

  -- THE DATE OF THE FFR IS THE DATE REVIEW 2 WAS COMPLETED (the user's rule).
  v_date := coalesce(p_review.review2_at, (now() at time zone 'Asia/Kolkata')::date);
  -- …and therefore so is its YEAR. A 2025 review numbered /26 would be wrong on
  -- the face of the document.
  v_no := public.next_ffr_no((extract(year from v_date)::int % 100)::smallint);

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
    coalesce(nullif(btrim(coalesce(p_review.review2_by, '')), ''), 'Daily Call Review'),
    jsonb_build_object(
      'raised_by_rule', 'any_potential_effect=YES',
      'risk_to_patient', coalesce(p_review.risk_to_patient, ''),
      'warranty_failure', coalesce(p_review.warranty_failure, ''),
      'frequent_failure', coalesce(p_review.frequent_failure, ''),
      'review2_at', p_review.review2_at,
      'review2_by', coalesce(p_review.review2_by, ''))
  );

  return v_no;
end $$;

-- The trigger now calls it, so there is one definition of the record.
create or replace function public.ffr_from_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if upper(coalesce(btrim(new.any_potential_effect), '')) <> 'YES' then return new; end if;
  perform public.raise_ffr(new);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- THE CATCH-UP.
--
-- DRY RUN BY DEFAULT. The numbers this issues are permanent, and a count
-- discovered afterwards is a count discovered too late:
--
--   select * from public.backfill_ffrs();            -- what it WOULD create
--   select * from public.backfill_ffrs(false);       -- create them
--
-- IN REVIEW ORDER, oldest first, so the numbering runs the way the register
-- was written rather than the order rows happen to come back. Deterministic on
-- a re-run for the same reason.
--
-- Idempotent: raise_ffr() returns NULL for a call that already has a report, so
-- running it twice creates nothing the second time.
-- ---------------------------------------------------------------------------
create or replace function public.backfill_ffrs(p_dry_run boolean default true)
returns table (ucn text, ffr_no text, ffr_date date, customer text, product text, note text)
language plpgsql security definer set search_path = public as $$
declare
  r      public.call_reviews;
  v_no   text;
  v_call record;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may back-fill the Field Failure Register.';
  end if;

  for r in
    select cr.* from public.call_reviews cr
     where upper(coalesce(btrim(cr.any_potential_effect), '')) = 'YES'
       and coalesce(btrim(cr.ucn), '') <> ''
       and not exists (select 1 from public.field_failure_reports f where f.ucn = cr.ucn)
     order by cr.review2_at nulls last, cr.ucn
  loop
    select c.party_name, c.product_name into v_call
      from public.calls c where c.ucn = r.ucn limit 1;

    if p_dry_run then
      ucn := r.ucn;
      -- The number is NOT issued on a dry run: reserving one and not using it
      -- would leave a gap in a numbered series that somebody has to explain.
      ffr_no := '(would be issued in ' || coalesce(to_char(r.review2_at, 'YYYY'), 'this year') || ')';
      ffr_date := r.review2_at;
      customer := coalesce(v_call.party_name, '');
      product := coalesce(v_call.product_name, '');
      note := 'would create';
      return next;
    else
      v_no := public.raise_ffr(r);
      if v_no is not null then
        ucn := r.ucn; ffr_no := v_no; ffr_date := r.review2_at;
        customer := coalesce(v_call.party_name, '');
        product := coalesce(v_call.product_name, '');
        note := 'created';
        return next;
      end if;
    end if;
  end loop;
end $$;

revoke all on function public.backfill_ffrs(boolean) from public;
grant execute on function public.backfill_ffrs(boolean) to authenticated;
