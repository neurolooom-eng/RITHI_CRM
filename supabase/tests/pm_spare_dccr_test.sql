-- ===========================================================================
-- A PM CALL WHOSE CONSUMPTION IS A SPARE GOES TO THE DCCR REVIEW (0397).
--
--   A Spare (Part Master category) consumed on a PM call opens its DCCR
--   review with SPARE pre-set and the call appears in the DCCR View; a
--   Consumable does not; a Field call is unaffected; an existing review is
--   never changed; a voided line (quantity 0) opens nothing.
--
-- Run ONCE after _stub.sql + every migration. Superuser for the fixture.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.parts (code, description, category) values
 ('PMSP-1', 'Flow sensor', 'Spare'), ('PMCO-1', 'Filter', 'Consumable')
on conflict do nothing;
update public.parts set category = 'Spare' where code = 'PMSP-1';
update public.parts set category = 'Consumable' where code = 'PMCO-1';

alter table public.pm_calls disable trigger user;
insert into public.pm_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name) values
 ('PMD-1', 'PM-1', 'P M VISIT', 'VEGA', 'S1', date '2026-03-01', 'P'),
 ('PMD-2', 'PM-2', 'P M VISIT', 'VEGA', 'S2', date '2026-03-01', 'P'),
 ('PMD-3', 'PM-3', 'P M VISIT', 'VEGA', 'S3', date '2026-03-01', 'P'),
 ('PMD-4', 'PM-4', 'P M VISIT', 'VEGA', 'S4', date '2026-03-01', 'P');
alter table public.pm_calls enable trigger user;
-- A spare needs a visit behind it (0214).
alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, visit_at, updated_at, data)
select 'V-' || u, u, 'Solved - Report Completed', '2026-03-02', '2026-03-02', '{}'::jsonb
  from unnest(array['PMD-1','PMD-2','PMD-3','PMD-4']) u;
alter table public.reports enable trigger user;
insert into public.call_reviews (ucn, spare_category, complaint_grouping) values ('PMD-3', 'CORRECTION', 'KEPT');

-- The hand-stock cap (consumption_reconcile_guard) is not what this tests: lifted by name.
alter table public.spare_consumption disable trigger consumption_reconcile_guard;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer) values
 ('PMD-1', 'PM-1', 'PMSP-1|Flow sensor', 1, 'ENG'),
 ('PMD-2', 'PM-2', 'PMCO-1|Filter', 1, 'ENG'),
 ('PMD-3', 'PM-3', 'PMSP-1|Flow sensor', 1, 'ENG'),
 ('PMD-4', 'PM-4', 'PMSP-1|Flow sensor', 0, 'ENG');
alter table public.spare_consumption enable trigger consumption_reconcile_guard;

select 'a Spare consumed on a PM call opens its review, SPARE pre-set' as t,
       (select spare_category from public.call_reviews where ucn = 'PMD-1') = 'SPARE' as ok;
select '...and the PM call is in the DCCR View and its summary' as t,
       exists (select 1 from public.field_call_review where ucn = 'PMD-1')
   and exists (select 1 from public.field_call_review_summary where ucn = 'PMD-1') as ok;
select 'a Consumable opens nothing, and that PM call is not in the DCCR View' as t,
       not exists (select 1 from public.call_reviews where ucn = 'PMD-2')
   and not exists (select 1 from public.field_call_review where ucn = 'PMD-2') as ok;
select 'an existing review is never changed' as t,
       (select spare_category = 'CORRECTION' and complaint_grouping = 'KEPT' from public.call_reviews where ucn = 'PMD-3') as ok;
select 'a line of quantity 0 opens nothing' as t,
       not exists (select 1 from public.call_reviews where ucn = 'PMD-4') as ok;
select 'the DCCR View still lists every Field call' as t,
       (select count(*) from public.field_call_review) >= (select count(*) from public.field_calls) as ok;
