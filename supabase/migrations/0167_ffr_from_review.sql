-- ===========================================================================
-- 0167 — AN FFR IS RAISED BY THE REVIEW, NOT BY A BUTTON.
--
-- The user's rule (2026-09-12): "When any call is marked as yes for Any
-- Potential Effect in DCCR, then it has to create an FFR using all the details
-- in DCCR. Date of FFR is the date review 2 completion."
--
-- WHY IN THE DATABASE. `any_potential_effect` is a GENERATED column on
-- call_reviews — YES when any of Risk to Patient / Warranty Failure / Frequent
-- Failure is YES, blank while any is unanswered (0044). The answer is therefore
-- made by writing the review, and the FFR must follow the answer rather than
-- somebody remembering to press a button afterwards. A register that depends on
-- a screen being opened is a register with holes in it.
--
-- IDEMPOTENT, and that is the whole safety of it: one FFR per call. Review 2
-- is edited, re-saved and corrected; every one of those writes fires this, and
-- all but the first must do nothing.
--
-- AND IT NEVER UNDOES ITSELF. If the answer is later changed to NO, the FFR
-- STAYS — a quality record is not deleted because somebody revised an opinion
-- (0049's rule). It is closed with a remark, by a person, on the register.
-- ===========================================================================

create or replace function public.ffr_from_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ucn  text := coalesce(nullif(btrim(new.ucn), ''), '');
  v_call record;
begin
  -- Only on YES, and only once Review 2 has actually been completed: the
  -- generated column is blank until all three answers are in, so this cannot
  -- fire on a half-answered review.
  if upper(coalesce(btrim(new.any_potential_effect), '')) <> 'YES' then return new; end if;
  if v_ucn = '' then return new; end if;
  if exists (select 1 from public.field_failure_reports f where f.ucn = v_ucn) then return new; end if;

  -- THE CALL, FROM THE BASE TABLES. Not the `calls` view: it is
  -- security_invoker, so inside a definer function it would apply the CALLER's
  -- row policies — and a call this cannot see is an FFR it would fail to raise,
  -- silently, for exactly the reviewer whose answer triggered it. Same reasoning
  -- as 0125 gives for the UCN counter.
  select fc.ucn, fc.call_number, fc.reg_date, fc.party_name, fc.city, fc.state,
         fc.product_name, fc.serial, fc.item_status, fc.call_type,
         fc.warranty_start, fc.complaint_reported, fc.standard_complaint,
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
    source, ucn, ffr_date, crn_date,
    customer_name, place, product_name, product_serial, cover, installation_date,
    problem_reported, service_observation, problem_status,
    visit_remarks, spares_consumed, current_call_status, call_solved_at, call_type,
    capa_responsibility, capa_no, capa_status, ffr_status,
    raised_by_name, extra
  )
  values (
    'PC',
    v_ucn,
    -- THE DATE OF THE FFR IS THE DATE REVIEW 2 WAS COMPLETED (the user's rule).
    -- review2_at is stamped by 0044 when the third answer lands.
    coalesce(new.review2_at, (now() at time zone 'Asia/Kolkata')::date),
    v_call.reg_date,
    coalesce(v_call.party_name, ''), coalesce(v_call.city, ''),
    coalesce(v_call.product_name, ''), coalesce(v_call.serial, ''),
    coalesce(v_call.item_status, ''), v_call.warranty_start,
    coalesce(nullif(btrim(coalesce(v_call.complaint_reported, '')), ''),
             coalesce(v_call.standard_complaint, '')),
    -- Review 3's own field is HEADED "Service Dept Observation" — the FFR
    -- column of that name. Blank while Review 3 is outstanding, and filled by
    -- the update below when it is answered.
    coalesce(new.service_observation, ''),
    '',                                   -- Problem Status: written on the FFR
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
    coalesce(nullif(btrim(coalesce(new.review2_by, '')), ''), 'Daily Call Review'),
    -- WHY it was raised, kept with the record: which of the three answers was
    -- YES is the finding, and "Any Potential Effect = YES" alone does not say.
    jsonb_build_object(
      'raised_by_rule', 'any_potential_effect=YES',
      'risk_to_patient', coalesce(new.risk_to_patient, ''),
      'warranty_failure', coalesce(new.warranty_failure, ''),
      'frequent_failure', coalesce(new.frequent_failure, ''),
      'review2_at', new.review2_at,
      'review2_by', coalesce(new.review2_by, ''))
  );

  return new;
end $$;

drop trigger if exists zz_ffr_from_review on public.call_reviews;
create trigger zz_ffr_from_review after insert or update on public.call_reviews
  for each row execute function public.ffr_from_review();

-- ---------------------------------------------------------------------------
-- REVIEW 3 ARRIVES LATER, and it carries the observation. When it is answered
-- the FFR's observation is filled in — but ONLY while nobody has written one on
-- the report itself: the FFR is where that text is finished, and overwriting a
-- person's wording with the review's would lose work without saying so.
-- ---------------------------------------------------------------------------
create or replace function public.ffr_observation_from_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(btrim(new.service_observation), '') = '' then return new; end if;
  if coalesce(btrim(coalesce(old.service_observation, '')), '') = btrim(new.service_observation) then return new; end if;
  update public.field_failure_reports
     set service_observation = new.service_observation
   where ucn = btrim(new.ucn)
     and coalesce(btrim(service_observation), '') = '';
  return new;
end $$;

drop trigger if exists zz_ffr_observation on public.call_reviews;
create trigger zz_ffr_observation after update of service_observation on public.call_reviews
  for each row execute function public.ffr_observation_from_review();

-- ---------------------------------------------------------------------------
-- THE REGISTER, WITH THE LIVE CALL ON IT (the user: "all the Live data should
-- show in the field failure register as well for analysis and decisions").
--
-- The TABLE is the record — what was believed when the report was raised, which
-- is what the document prints. The VIEW is the record beside the call as it
-- stands NOW: its status, its latest visit, everything booked against it since.
-- The sheet's own column is called CURRENT call status, so this is the column
-- doing what its name says rather than a new idea.
--
-- security_invoker, so a reader sees only the reports and calls their role
-- allows. Without it this view would read as its owner and hand every FFR to
-- everyone (the fault 0040/0050/0057 shipped three times).
-- ---------------------------------------------------------------------------
create or replace view public.field_failure_register as
select
  f.*,
  c.open_state                      as live_call_status,
  c.last_visit_at                   as live_last_visit_at,
  c.allocated_to                    as live_engineer,
  c.party_name                      as live_customer_name,
  c.item_status                     as live_cover,
  (select count(*) from public.reports rp where rp.ucn = f.ucn)            as live_visit_count,
  (select coalesce(string_agg(distinct btrim(s.part), ', '), '')
     from public.spare_consumption s
    where s.ucn = f.ucn and coalesce(s.qty, 0) > 0)                        as live_spares_consumed,
  -- The review that raised it, as it stands now. A reviewer who later changed
  -- an answer to NO leaves the FFR standing (0049), and this is how somebody
  -- sees that happened.
  r.any_potential_effect            as live_any_potential_effect,
  r.risk_to_patient                 as live_risk_to_patient,
  r.warranty_failure                as live_warranty_failure,
  r.frequent_failure                as live_frequent_failure,
  r.complaint_grouping              as live_complaint_grouping,
  r.root_cause_keyword              as live_root_cause_keyword,
  r.spare_category                  as live_spare_category,
  r.review2_at                      as live_review2_at,
  r.review3_done                    as live_review3_done
from public.field_failure_reports f
left join public.calls c        on c.ucn = f.ucn
left join public.call_reviews r on r.ucn = f.ucn;

alter view public.field_failure_register set (security_invoker = on);
grant select on public.field_failure_register to authenticated;
