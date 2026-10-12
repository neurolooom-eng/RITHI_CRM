-- ===========================================================================
-- THE VOIDED KY550200 CONSUMPTION ON 26G06F0006 DELETED (0421): exactly that
-- row goes, its image is in the row audit, a neighbour stays, a re-run and a
-- second match delete nothing. (The app role's refusal is 0049's, tested
-- there: here RLS would hide the row and make such a step vacuous.)
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
update public.harness set uid = null, email = null;
alter table public.spare_consumption disable trigger user;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, source, adjustment_reason, adjusted_by) values
 ('26G06F0006', 'R17857-VEGA-70', 'KY550200|MOTHER BOARD - OSIRIS 3', 0, 'AJAY G (INDOOR SERVICE)', 'Report', 'Wrongly Enter', 'VIGNESH'),
 ('26G06F0006', 'R17857-VEGA-70', 'EM-910|4 WIRE TOUCH SCREEN',       1, 'AJAY G (INDOOR SERVICE)', 'Report', '', '');
alter table public.spare_consumption enable trigger user;

\i supabase/migrations/0421_delete_voided_ky550200_consumption.sql
select 'the voided KY550200 line is gone, its neighbour stays' as t,
  not exists (select 1 from public.spare_consumption where ucn = '26G06F0006' and part like 'KY550200%')
  and exists (select 1 from public.spare_consumption where ucn = '26G06F0006' and part like 'EM-910%') as ok;
select 'the row audit holds its image' as t,
  exists (select 1 from public.record_audit where table_name = 'spare_consumption' and op = 'DELETE'
             and old_data->>'ucn' = '26G06F0006' and old_data->>'part' like 'KY550200%') as ok;

\i supabase/migrations/0421_delete_voided_ky550200_consumption.sql
select 'a re-run deletes nothing' as t,
  exists (select 1 from public.spare_consumption where ucn = '26G06F0006' and part like 'EM-910%') as ok;

alter table public.spare_consumption disable trigger user;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, source, adjustment_reason) values
 ('26G06F0006', 'X', 'KY550200|MOTHER BOARD - OSIRIS 3', 0, 'AJAY G (INDOOR SERVICE)', 'Report', 'Wrongly Enter'),
 ('26G06F0006', 'Y', 'KY550200|MOTHER BOARD - OSIRIS 3', 0, 'AJAY G (INDOOR SERVICE)', 'Report', 'Wrongly Enter');
alter table public.spare_consumption enable trigger user;
\i supabase/migrations/0421_delete_voided_ky550200_consumption.sql
select 'two matches: nothing deleted' as t,
  (select count(*) = 2 from public.spare_consumption where ucn = '26G06F0006' and part like 'KY550200%') as ok;

