-- ===========================================================================
-- THE CUSTOMER FEEDBACK OBJECTIVE, AS THE WORKBOOK WORKS IT OUT (0422).
--
--   Excellent 4 / Good 3 / Average 2 / Poor 1; an installation call (any type
--   with INSTALLATION, so "INSTALLATION CALL & FIELD" too) on its 5
--   installation questions / 20, any other on its 6 PM/FIELD questions / 24;
--   a feedback missing a question is left out; the figure is the average over
--   the feedback whose VISIT DATE falls in the period; the evidence lists the
--   same rows with each score.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values ('0e422000-0000-0000-0000-000000000001', 'fbs_admin@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e422000-0000-0000-0000-000000000001', 'fbs_admin@x.com', 'FBS Admin', 'admin')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
call public.be('fbs_admin@x.com');

alter table public.feedback disable trigger user;
insert into public.feedback (ucn, call_number, call_type, visit_at, entry_at, answers) values
 ('FBS-1', 'C1', 'FIELD', '2025-03-05 10:00+05:30', '2025-03-05 10:00+05:30',
  '{"INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment":"Excellent","INSTALLATION/PM/FIELD-In general, support of our company for your requirements":"Excellent","PM/FIELD-Ability of our Product to meet your requirement":"Excellent","PM/FIELD-Reliability of Product":"Excellent","PM/FIELD-Reliability of Service":"Excellent","PM/FIELD-Promptness for Service Calls":"Excellent"}'),
 ('FBS-2', 'C2', 'P M VISIT', '2025-03-10 10:00+05:30', '2025-04-02 10:00+05:30',
  '{"INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment":"Excellent","INSTALLATION/PM/FIELD-In general, support of our company for your requirements":"Excellent","PM/FIELD-Ability of our Product to meet your requirement":"Good","PM/FIELD-Reliability of Product":"Good","PM/FIELD-Reliability of Service":"Average","PM/FIELD-Promptness for Service Calls":"Excellent"}'),
 ('FBS-3', 'C3', 'INSTALLATION CALL', '2025-03-12 10:00+05:30', '2025-03-12 10:00+05:30',
  '{"INSTALLATION-Startup, Training and Handing Over":"Good","INSTALLATION-Packing and Forwarding":"Good","INSTALLATION-Delivery adherence schedule":"Good","INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment":"Good","INSTALLATION/PM/FIELD-In general, support of our company for your requirements":"Good"}'),
 ('FBS-4', 'C4', 'INSTALLATION CALL & FIELD', '2025-03-15 10:00+05:30', '2025-03-15 10:00+05:30',
  '{"INSTALLATION-Startup, Training and Handing Over":"Good","INSTALLATION-Packing and Forwarding":"Good","INSTALLATION-Delivery adherence schedule":"Good","INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment":"Good","INSTALLATION/PM/FIELD-In general, support of our company for your requirements":"Good","PM/FIELD-Ability of our Product to meet your requirement":"Excellent","PM/FIELD-Reliability of Product":"Excellent","PM/FIELD-Reliability of Service":"Excellent","PM/FIELD-Promptness for Service Calls":"Excellent"}'),
 ('FBS-5', 'C5', 'FIELD', '2025-03-20 10:00+05:30', '2025-03-20 10:00+05:30',
  '{"INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment":"Excellent","INSTALLATION/PM/FIELD-In general, support of our company for your requirements":"Excellent","PM/FIELD-Ability of our Product to meet your requirement":"Excellent","PM/FIELD-Reliability of Product":"Excellent","PM/FIELD-Reliability of Service":"Excellent"}'),
 ('FBS-6', 'C6', 'FIELD', '2025-04-01 00:30+05:30', '2025-03-31 10:00+05:30',
  '{"INSTALLATION/PM/FIELD-Operating Feasibility of the Equipment":"Poor","INSTALLATION/PM/FIELD-In general, support of our company for your requirements":"Poor","PM/FIELD-Ability of our Product to meet your requirement":"Poor","PM/FIELD-Reliability of Product":"Poor","PM/FIELD-Reliability of Service":"Poor","PM/FIELD-Promptness for Service Calls":"Poor"}');
alter table public.feedback enable trigger user;

insert into public.quality_objectives (year, sort_order, process, parameter, yearly_target, frequency, calc_key, calc_params)
values (2025, 422, 'TEST', 'FBS satisfaction', '>75%', 'Monthly', 'feedback_satisfaction', '{}');

\echo '--- 1. each call scored as the workbook scores it ---'
select 'field all Excellent = 100%; PM 20/24; installation 15/20; Inst & Field on the installation questions; a missing answer is no score' as t,
  (select public.feedback_satisfaction(answers, call_type) = 1 from public.feedback where ucn = 'FBS-1')
  and (select round(public.feedback_satisfaction(answers, call_type), 6) = round(20::numeric / 24, 6) from public.feedback where ucn = 'FBS-2')
  and (select public.feedback_satisfaction(answers, call_type) = 0.75 from public.feedback where ucn = 'FBS-3')
  and (select public.feedback_satisfaction(answers, call_type) = 0.75 from public.feedback where ucn = 'FBS-4')
  and (select public.feedback_satisfaction(answers, call_type) is null from public.feedback where ucn = 'FBS-5') as ok;

\echo '--- 2. the month is the VISIT date, not the feedback date ---'
select 'March 2025 = average(100%, 83.33%, 75%, 75%) = 83.33%; FBS-2 counts in March (visited), FBS-6 in April (visited 1 Apr IST)' as t,
  public.objective_value(id, 3) = round((1 + 20::numeric / 24 + 0.75 + 0.75) / 4, 6) as ok
  from public.quality_objectives where parameter = 'FBS satisfaction';
select 'April 2025 = FBS-6 alone, all Poor = 25%' as t,
  public.objective_value(id, 4) = 0.25 as ok
  from public.quality_objectives where parameter = 'FBS satisfaction';

\echo '--- 3. the evidence lists the same rows, each with its score ---'
select 'March evidence: 4 rows, FBS-4 scored on the installation questions, its % 0.75' as t,
  count(*) = 4
  and bool_or(ucn = 'FBS-4' and details->>'Scored on' like 'Installation%' and (details->>'Satisfaction %')::numeric = 0.75)
  and not bool_or(ucn = 'FBS-5') as ok
  from public.objective_evidence((select id from public.quality_objectives where parameter = 'FBS satisfaction'), 3);

\echo '--- 4. no feedback, no figure ---'
select 'May 2025 has no feedback -- null, not zero' as t,
  public.objective_value(id, 5) is null as ok
  from public.quality_objectives where parameter = 'FBS satisfaction';
