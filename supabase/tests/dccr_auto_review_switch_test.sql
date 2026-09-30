-- ===========================================================================
-- AUTO REVIEW IS A NAMED PERSON'S SWITCH; OLD REVIEWS LOAD WITHOUT RAISING
-- REPORTS; AN FFR'S CAPA STARTS BLANK (0269, the user, 2026-09-30).
--
-- WHAT THIS PROVES, as signed-in users (never the superuser, who ignores both
-- row-level security and EXECUTE grants):
--   1. auto review starts OFF, and while off answers nothing;
--   2. only a person holding review.auto can switch it; anybody else is refused;
--   3. switched on, its answers carry THAT PERSON'S name and account, and the
--      review2_auto marker — not the name of whoever opened the register;
--   4. nobody can set review2_auto through the API, and switching off stops it;
--   5. an administrator's imported review keeps its file's reviewer and dates,
--      is not stamped with the uploader, and raises no FFR;
--   6. a non-administrator cannot mark a review imported to dodge the FFR rule;
--   7. an FFR raised from a review has its CAPA fields blank;
--   8. a Review 2 a person has part-answered is never overwritten by the rule;
--   9. it is held by ROLE (0271): an NSM and a Technical Support user holding
--      nothing of their own can switch it, a Zoho Migration user cannot, and
--      0269's grant to a person by name is taken back while a grant an
--      administrator gave somebody else is kept.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('02670000-0000-0000-0000-000000000001', 'bagya@x.com'),
  ('02670000-0000-0000-0000-000000000002', 'opener@x.com'),
  ('02670000-0000-0000-0000-000000000003', 'dccr-admin@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, extra_permissions) values
  ('02670000-0000-0000-0000-000000000001', 'bagya@x.com',      'M Bagyaraj', 'nsm',     '[]'),
  ('02670000-0000-0000-0000-000000000002', 'opener@x.com',     'The Opener', 'hotline', '[]'),
  ('02670000-0000-0000-0000-000000000003', 'dccr-admin@x.com', 'DCCR Admin', 'admin',   '[]')
on conflict (id) do update set role = excluded.role, extra_permissions = excluded.extra_permissions;
insert into public.user_directory (name, email) values ('M Bagyaraj', 'bagya@x.com');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Two routine calls logged well before "today" (2026-09-10), both long out of
-- their first year, plus calls for the import and FFR cases.
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, complaint_date,
                                warranty_start, party_name, complaint_reported, standard_complaint, allocated_to)
values
 ('AS-1', 'C-AS1', 'FIELD', 'VEGA', 'S1', date '2026-09-01', date '2026-09-01', date '2019-01-01', 'H', 'x', 'y', 'E'),
 ('AS-2', 'C-AS2', 'FIELD', 'VEGA', 'S2', date '2026-09-01', date '2026-09-01', date '2019-01-01', 'H', 'x', 'y', 'E');

\echo ''
\echo '--- 1. auto review starts OFF, and while off answers nothing ---'
do $$
declare r record;
begin
  select * into r from public.auto_review_state();
  if r.enabled then raise exception 'auto review should start off'; end if;
  select * into r from public.auto_answer_review2_asof(timestamptz '2026-09-10 10:00:00+05:30');
  if r.ran or r.marked <> 0 then raise exception 'while off it ran and marked %', r.marked; end if;
  raise notice 'ok: off, and "%"', r.note;
end $$;

\echo ''
\echo '--- 2. only a person holding review.auto can switch it ---'
call public.be('opener@x.com');
set role authenticated;
\echo 'expect ERROR: RBAC, the opener does not hold review.auto'
select * from public.set_auto_review(true);
reset role;

call public.be('bagya@x.com');
set role authenticated;
select 'switched on by' as check, enabled, by_name from public.set_auto_review(true);
reset role;

-- A Review 2 a person has STARTED: Risk to Patient YES, the rest blank. The
-- rule must leave it alone rather than overwrite the YES with NO.
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, complaint_date,
                                warranty_start, party_name, complaint_reported, standard_complaint, allocated_to)
values ('AS-PART', 'C-PRT', 'FIELD', 'VEGA', 'S6', date '2026-09-01', date '2026-09-01', date '2019-01-01', 'H', 'x', 'y', 'E');
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure)
values ('AS-PART', 'C-PRT', 'YES', '', '');

\echo ''
\echo '--- 3. its answers carry the switcher''s name, not the opener''s ---'
-- The register runs the sweep when somebody opens it: here the opener has.
call public.be('opener@x.com');
select marked from public.auto_answer_review2_asof(timestamptz '2026-09-10 10:00:00+05:30');
do $$
declare got text;
begin
  select string_agg(ucn || '=' || review2_by || '/' || coalesce(review2_by_uid::text, '-') || '/' || review2_auto, ', ' order by ucn)
    into got from public.call_reviews where ucn in ('AS-1', 'AS-2');
  if got is distinct from 'AS-1=M Bagyaraj/02670000-0000-0000-0000-000000000001/true, AS-2=M Bagyaraj/02670000-0000-0000-0000-000000000001/true' then
    raise exception 'auto answers should carry Bagyaraj and the marker: %', got;
  end if;
  raise notice 'ok: %', got;
  select risk_to_patient || '/' || warranty_failure || '/' || frequent_failure || '/' || review2_auto into got
    from public.call_reviews where ucn = 'AS-PART';
  if got is distinct from 'YES///false' then
    raise exception 'a part-answered Review 2 was overwritten: %', got;
  end if;
  raise notice 'ok: the part-answered Review 2 was left as the person left it';
end $$;

-- The calls for the later steps, created AFTER the sweep so it cannot answer them.
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, complaint_date,
                                warranty_start, party_name, complaint_reported, standard_complaint, allocated_to)
values
 ('AS-IMP', 'C-IMP', 'FIELD', 'VEGA', 'S3', date '2024-03-01', date '2024-03-01', date '2019-01-01', 'H', 'x', 'y', 'E'),
 ('AS-FORGE', 'C-FRG', 'FIELD', 'VEGA', 'S4', date '2026-09-01', date '2026-09-01', date '2019-01-01', 'H', 'x', 'y', 'E'),
 ('AS-FFR', 'C-FFR', 'FIELD', 'VEGA', 'S5', date '2026-09-01', date '2026-09-01', date '2019-01-01', 'H', 'x', 'y', 'E');

\echo ''
\echo '--- 4. nobody sets review2_auto through the API; switching off stops it ---'
call public.be('opener@x.com');
set role authenticated;
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, review2_by, review2_auto)
values ('AS-FORGE', 'C-FRG', 'NO', 'NO', 'NO', 'M Bagyaraj', true);
reset role;
do $$
declare r record;
begin
  select review2_auto, review2_by_uid into r from public.call_reviews where ucn = 'AS-FORGE';
  if r.review2_auto then raise exception 'the API set the auto-review marker'; end if;
  if r.review2_by_uid is distinct from '02670000-0000-0000-0000-000000000002'::uuid then
    raise exception 'the person who answered should be stamped, got %', r.review2_by_uid;
  end if;
  raise notice 'ok: marker discarded, the opener stamped as the one who answered';
end $$;

call public.be('bagya@x.com');
set role authenticated;
select 'switched off' as check, enabled from public.set_auto_review(false);
reset role;
delete from public.call_reviews where ucn = 'AS-2';
do $$
declare r record;
begin
  select * into r from public.auto_answer_review2_asof(timestamptz '2026-09-10 10:00:00+05:30');
  if r.ran or exists (select 1 from public.call_reviews where ucn = 'AS-2') then
    raise exception 'switched off, it still answered';
  end if;
  if (select count(*) from public.auto_review_changes) <> 2 then
    raise exception 'both switches should be on record';
  end if;
  raise notice 'ok: off stops it, and both switches are recorded';
end $$;

\echo ''
\echo '--- 5. an administrator''s imported review keeps its own reviewer and dates, raises no FFR ---'
call public.be('dccr-admin@x.com');
set role authenticated;
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure,
                                 review2_by, review2_at, imported)
values ('AS-IMP', 'C-IMP', 'YES', 'NO', 'NO', 'Old Reviewer', date '2024-03-05', true);
reset role;
do $$
declare r record;
begin
  select review2_by, review2_at, review2_by_uid, imported into r from public.call_reviews where ucn = 'AS-IMP';
  if not r.imported or r.review2_by <> 'Old Reviewer' or r.review2_at <> date '2024-03-05' or r.review2_by_uid is not null then
    raise exception 'imported review altered: %', r;
  end if;
  if exists (select 1 from public.field_failure_reports where ucn = 'AS-IMP') then
    raise exception 'an imported review raised an FFR';
  end if;
  raise notice 'ok: kept as loaded, no FFR';
end $$;

\echo ''
\echo '--- 6. and 7. a non-administrator cannot mark a review imported; the FFR it raises has blank CAPA ---'
call public.be('opener@x.com');
set role authenticated;
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, imported)
values ('AS-FFR', 'C-FFR', 'YES', 'NO', 'NO', true);
reset role;
do $$
declare r record;
begin
  if (select imported from public.call_reviews where ucn = 'AS-FFR') then
    raise exception 'a non-administrator marked a review imported';
  end if;
  select capa_responsibility, capa_no, capa_status, ffr_status into r
    from public.field_failure_reports where ucn = 'AS-FFR';
  if not found then raise exception 'the YES review should have raised its FFR'; end if;
  if r.capa_responsibility <> '' or r.capa_no <> '' or r.capa_status <> '' then
    raise exception 'CAPA should start blank, got % / % / %', r.capa_responsibility, r.capa_no, r.capa_status;
  end if;
  raise notice 'ok: imported flag discarded, FFR raised with CAPA blank and status %', r.ffr_status;
end $$;

\echo ''
\echo '--- 9. held by role: NSM and Technical Support may switch it, Zoho Migration may not; the by-name grant is taken back ---'
insert into auth.users (id, email) values
  ('02670000-0000-0000-0000-000000000011', 'ts@x.com'),
  ('02670000-0000-0000-0000-000000000012', 'zoho@x.com'),
  ('02670000-0000-0000-0000-000000000013', 'vig@x.com'),
  ('02670000-0000-0000-0000-000000000014', 'given@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, extra_permissions) values
  ('02670000-0000-0000-0000-000000000011', 'ts@x.com',    'Tech Support', 'technical_support', '[]'),
  ('02670000-0000-0000-0000-000000000012', 'zoho@x.com',  'Zoho Person',  'zoho_migration',    '[]'),
  ('02670000-0000-0000-0000-000000000013', 'vig@x.com',   'Vignesh T',    'engineer',          '["review.auto"]'),
  ('02670000-0000-0000-0000-000000000014', 'given@x.com', 'Given By Hand','engineer',          '["review.auto"]')
on conflict (id) do update set role = excluded.role, extra_permissions = excluded.extra_permissions;
insert into public.user_directory (name, email) values ('Vignesh T', 'vig@x.com'), ('Given By Hand', 'given@x.com');

call public.be('ts@x.com');
set role authenticated;
select 'switched on by technical support' as check, enabled, by_name from public.set_auto_review(true);
reset role;

call public.be('zoho@x.com');
set role authenticated;
\echo 'expect ERROR: RBAC, Zoho Migration does not hold review.auto'
select * from public.set_auto_review(false);
reset role;

-- The nsm row holds it through the role, whatever Bagyaraj holds of his own.
call public.be('bagya@x.com');
set role authenticated;
select 'switched off by nsm' as check, enabled, by_name from public.set_auto_review(false);
reset role;

-- Re-running 0271 takes back what 0269 gave by name, and nothing else.
\ir ../migrations/0271_auto_review_by_role.sql
do $$
declare v text; g text;
begin
  select extra_permissions::text into v from public.profiles where email = 'vig@x.com';
  select extra_permissions::text into g from public.profiles where email = 'given@x.com';
  if v is distinct from '[]' then raise exception 'the by-name grant was not taken back: %', v; end if;
  if g is distinct from '["review.auto"]' then raise exception 'a grant given by hand was taken: %', g; end if;
  if exists (select 1 from public.app_roles where role = 'zoho_migration' and permissions ? 'review.auto') then
    raise exception 'Zoho Migration was given review.auto';
  end if;
  if exists (select 1 from public.app_roles where role in ('admin', 'nsm', 'technical_support')
              and jsonb_array_length(permissions) > 0 and not (permissions ? 'review.auto')) then
    raise exception 'a configured Admin, NSM or Technical Support row lacks review.auto';
  end if;
  raise notice 'ok: role grant in place, by-name grant taken back, a hand grant kept';
end $$;
