-- ===========================================================================
-- DAILY COMPLAINT REVIEW: AUTO REVIEW IS SWITCHED ON AND OFF BY A NAMED PERSON,
-- OLD REVIEWS LOAD WITHOUT RAISING REPORTS, AND AN FFR'S CAPA STARTS BLANK.
--
-- The user, 2026-09-30, three decisions:
--
--  1. "Create a Provision for Bagyaraj and Vignesh to Enable Auto Review or
--     Disable Auto Review. And Record that Person's name in Auto Reviewal."
--     Review 2's automatic NO (0124) now runs ONLY while a person holding
--     `review.auto` has switched it on, and every answer it gives carries THAT
--     PERSON'S NAME in review2_by and their account in review2_by_uid. The
--     `review2_auto` marker stays on the row, so the record still says the
--     answer came from the auto review a person switched on, not from them
--     looking at that call — Review 3 relies on telling the two apart. Every
--     switch is kept in `auto_review_changes`, with who and when.
--     IT STARTS OFF. Answers can carry only the name of somebody who switched
--     it on, and nobody has yet; until Bagyaraj or Vignesh does, Review 2 is
--     not answered automatically. `review.auto` is given to each of them below
--     where the User Master names exactly one such person.
--
--  2. "CAPA fields" are left BLANK when an FFR is raised — automatically from a
--     review (raise_ffr) and, in the client, from the Raise FFR form. They were
--     filled 'No closed in FFR' / 'NA' / 'Not required', which read as a
--     decision nobody had made. The two column defaults that did the same go.
--
--  3. Old reviews loaded through Bulk Uploads -> DCCR Register come in AS THEY
--     WERE: `imported` is set by the upload; such a row keeps the reviewer
--     names and dates its file carries (the uploader is not stamped as the
--     reviewer, and a missing date stays unknown rather than becoming today),
--     and it RAISES NO FFR — its report, where it had one, comes in through
--     the Field Failure Register upload. Only an administrator can mark a row
--     imported: it switches off the FFR rule for that call, so it is not a
--     flag a reviewer may set.
--
-- EVERY BODY BELOW WAS TAKEN FROM THE DATABASE and changed only where marked.
-- ===========================================================================

-- ---- the two markers --------------------------------------------------------
alter table public.call_reviews add column if not exists review2_auto boolean not null default false;
alter table public.call_reviews add column if not exists imported     boolean not null default false;
comment on column public.call_reviews.review2_auto is
  'Review 2 was answered by the auto review, in the name of the person who switched it on (0269). Set only by the database.';
comment on column public.call_reviews.imported is
  'Loaded from an old register by an administrator (0269): keeps its own reviewers and dates and raises no FFR.';

-- The answers the rule gave before this, under the old marker, are the same
-- kind of answer: say so on the row. Their review2_by is left as it was
-- written -- history is not re-attributed.
update public.call_reviews set review2_auto = true
 where review2_by = 'Auto (9:15 am)' and not review2_auto;

-- A caller through the API can set neither marker for itself: review2_auto
-- only the auto review sets, and imported only an administrator. DISCARDED,
-- not refused (the 0113 rule): an honest client that sends the column is not
-- failed for it, and a forged value does nothing. SECURITY INVOKER on purpose:
-- `current_user` is the API role when the API writes, and the owner when the
-- auto review writes from inside its definer function.
create or replace function public.call_review_markers()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.review2_auto := case when tg_op = 'UPDATE' then old.review2_auto else false end;
    if coalesce(new.imported, false) and not public.is_admin() then
      new.imported := case when tg_op = 'UPDATE' then old.imported else false end;
    end if;
  end if;
  return new;
end $$;
-- Named to run FIRST among the before-triggers, so every one after it reads
-- the markers already made honest.
drop trigger if exists a_call_review_markers on public.call_reviews;
create trigger a_call_review_markers
  before insert or update on public.call_reviews
  for each row execute function public.call_review_markers();

-- ---- the switch -------------------------------------------------------------
create table if not exists public.auto_review_changes (
  id              bigint generated always as identity primary key,
  turned_on       boolean not null,
  changed_by      uuid,
  changed_by_name text not null default '',
  changed_at      timestamptz not null default now()
);
alter table public.auto_review_changes enable row level security;
drop policy if exists arc_read on public.auto_review_changes;
create policy arc_read on public.auto_review_changes for select to authenticated using (true);
revoke insert, update, delete on public.auto_review_changes from public;
do $$ begin
  execute 'revoke insert, update, delete on public.auto_review_changes from anon, authenticated';
exception when undefined_object then null; end $$;
do $$ begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.auto_review_changes'::regclass);
  end if;
end $$;
comment on table public.auto_review_changes is
  'Every time auto review (Review 2) was switched on or off, by whom and when (0269). Written only by set_auto_review().';

-- The switch as it stands: the latest change, or OFF if there has been none.
create or replace function public.auto_review_state()
returns table (enabled boolean, by_uid uuid, by_name text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(c.turned_on, false), c.changed_by, coalesce(c.changed_by_name, ''), c.changed_at
    from (select 1) one
    left join lateral (
      select * from public.auto_review_changes order by changed_at desc, id desc limit 1
    ) c on true;
$$;
revoke execute on function public.auto_review_state() from public, anon;
grant  execute on function public.auto_review_state() to authenticated;

create or replace function public.set_auto_review(p_on boolean)
returns table (enabled boolean, by_uid uuid, by_name text, at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text;
begin
  if v_uid is null or not public.has_perm('review.auto') then
    raise exception 'RBAC: only a person given "Switch auto review on or off" can change auto review';
  end if;
  -- THE NAME THE ANSWERS WILL CARRY, found the way the reviewer stamp finds a
  -- reviewer's (0173): the User Master name, else the sign-in's full name.
  select coalesce(nullif(btrim(d.name), ''), nullif(btrim(p.full_name), ''), p.email)
    into v_name
    from public.profiles p
    left join public.user_directory d
      on lower(btrim(d.email)) = lower(btrim(p.email))
      or lower(btrim(d.gmail)) = lower(btrim(p.email))
   where p.id = v_uid
   limit 1;
  if coalesce(p_on, false) and coalesce(btrim(v_name), '') = '' then
    raise exception 'Your sign-in has no name on the User Master, so the auto review could not say whose answers they are';
  end if;
  insert into public.auto_review_changes (turned_on, changed_by, changed_by_name)
  values (coalesce(p_on, false), v_uid, coalesce(v_name, ''));
  return query select * from public.auto_review_state();
end $$;
revoke execute on function public.set_auto_review(boolean) from public, anon;
grant  execute on function public.set_auto_review(boolean) to authenticated;

-- ---- who may switch it: Bagyaraj and Vignesh ---------------------------------
-- By NAME, because that is how the user named them -- and only where exactly
-- one sign-in carries the name, since a second Vignesh joining later must not
-- be handed this by accident (0175 is the lesson). Merged into the person's own
-- extra permissions, never overwriting them. Anybody else is given it on
-- User Master -> Access by an administrator.
do $$
declare who text; n int; v_id uuid;
begin
  foreach who in array array['bagyaraj', 'vignesh'] loop
    select count(*), min(p.id::text)::uuid into n, v_id
      from public.profiles p
      left join public.user_directory d
        on lower(btrim(d.email)) = lower(btrim(p.email)) or lower(btrim(d.gmail)) = lower(btrim(p.email))
     where lower(coalesce(d.name, p.full_name, '')) like '%' || who || '%';
    if n = 1 then
      update public.profiles
         set extra_permissions = coalesce(extra_permissions, '[]'::jsonb) || '["review.auto"]'::jsonb
       where id = v_id and not (coalesce(extra_permissions, '[]'::jsonb) ? 'review.auto');
      raise notice '0269: review.auto given to the one sign-in named like %', who;
    else
      raise notice '0269: % sign-in(s) named like % -- review.auto NOT given; grant it on User Master -> Access', n, who;
    end if;
  end loop;
end $$;

-- ---- CAPA starts blank ------------------------------------------------------
alter table public.field_failure_reports alter column capa_no     set default '';
alter table public.field_failure_reports alter column capa_status set default '';

create or replace function public.raise_ffr(p_review call_reviews)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_ucn  text := coalesce(nullif(btrim(p_review.ucn), ''), '');
  v_call record;
  v_date date;
  v_no   text;
  v_by   text;
begin
  if v_ucn = '' then return null; end if;
  if exists (select 1 from public.field_failure_reports f where f.ucn = v_ucn) then return null; end if;
  -- AN IMPORTED REVIEW RAISES NOTHING (0269, the user: old reviews load
  -- "no new FFRs"). Its FFR, where it had one, comes in through the Field
  -- Failure Register upload; a report raised now from a years-old review would
  -- be a second, newly-numbered report of the same failure.
  if coalesce(p_review.imported, false) then return null; end if;

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
    -- CAPA IS DECIDED LATER, BY WHOEVER HANDLES IT (0269, the user). It was
    -- filled 'No closed in FFR' / 'NA' / 'Not required' at generation, which
    -- read as a decision nobody had made.
    '', '', '', 'Open',
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

create or replace function public.auto_answer_review2_asof(p_asof timestamp with time zone)
 RETURNS TABLE(marked integer, held_first_year integer, held_unknown_age integer, ran boolean, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_today date := (p_asof at time zone 'Asia/Kolkata')::date;
  v_time  time := (p_asof at time zone 'Asia/Kolkata')::time;
  n_ok    integer := 0;
  n_year  integer := 0;
  n_age   integer := 0;
  v_on    boolean;
  v_by    uuid;
  v_name  text;
begin
  -- ONLY WHILE SOMEBODY HAS SWITCHED IT ON, AND IN THEIR NAME (0269). The
  -- answers carry the name of the person who switched auto review on, and the
  -- `review2_auto` marker says the rule gave them, so Review 3 can still tell.
  select s.enabled, s.by_uid, s.by_name into v_on, v_by, v_name from public.auto_review_state() s;
  if not coalesce(v_on, false) then
    return query select 0, 0, 0, false, 'auto review is switched off'::text;
    return;
  end if;

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
      (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, review2_by, review2_by_uid, review2_auto)
    select p.ucn, p.call_number, 'NO', 'NO', 'NO', v_name, v_by, true
      from pending p
     where p.age_at_failure is not null and p.age_at_failure >= 366
    on conflict (ucn) do update
       set risk_to_patient  = excluded.risk_to_patient,
           warranty_failure = excluded.warranty_failure,
           frequent_failure = excluded.frequent_failure,
           review2_by       = excluded.review2_by,
           review2_by_uid   = excluded.review2_by_uid,
           review2_auto     = true
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

create or replace function public.call_review_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
declare
  was2 boolean := case when tg_op = 'UPDATE' then old.review2_done else false end;
  was3 boolean := case when tg_op = 'UPDATE' then old.review3_done else false end;
  new_effect text := case
      when btrim(new.risk_to_patient) = '' or btrim(new.warranty_failure) = '' or btrim(new.frequent_failure) = '' then ''
      when upper(btrim(new.risk_to_patient))  = 'YES' then 'YES'
      when upper(btrim(new.warranty_failure)) = 'YES' then 'YES'
      when upper(btrim(new.frequent_failure)) = 'YES' then 'YES'
      else 'NO'
    end;
  done2 boolean := btrim(new.risk_to_patient) <> '' and btrim(new.warranty_failure) <> '' and btrim(new.frequent_failure) <> '';
  done3 boolean := btrim(new.complaint_grouping) <> '' and btrim(new.root_cause_keyword) <> '' and btrim(new.spare_category) <> '';
begin
  -- AN IMPORTED REVIEW KEEPS THE DATES ITS FILE CARRIES, and a date the file
  -- does not carry stays UNKNOWN rather than becoming the day it was loaded
  -- (0269): a review of 2024 dated today is a false record, not a missing one.
  if done2 and new.review2_at is null and not coalesce(new.imported, false) then new.review2_at := current_date; end if;
  if not done2 and not was2 then new.review2_at := null; end if;
  if done3 and new.review3_at is null and not coalesce(new.imported, false) then new.review3_at := current_date; end if;
  if not done3 and not was3 then new.review3_at := null; end if;

  -- The action a potential effect calls for: raise a Field Failure Report.
  if new_effect = 'YES' and btrim(new.action_taken) = '' then
    new.action_taken := 'FFR Generation';
  elsif new_effect <> 'YES' and new.action_taken = 'FFR Generation' then
    new.action_taken := '';
  end if;

  new.updated_at := now();
  if new.updated_by is null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

create or replace function public.call_review_reviewer_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
  -- NOT FOR AN IMPORTED REVIEW, AND NOT FOR THE AUTO REVIEW (0269). An old
  -- review loaded from a file names its own reviewers; the person loading it
  -- did not review it. An auto-review answer already names the person who
  -- switched auto review on; whoever happened to open the register when the
  -- sweep ran did not answer it either.
  if coalesce(new.imported, false) then return new; end if;

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

  if now2 and not was2 and not coalesce(new.review2_auto, false) then
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
