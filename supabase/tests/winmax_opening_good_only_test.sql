-- ===========================================================================
-- THE WINMAX OPENING IS THE GOOD BALANCE ONLY (0411, D-161).
--
--   A WinMax HS row loaded as good + defective is cut to its good balance,
--   recording the defective taken out; a row whose good balance was nothing
--   is removed; a row with no defective, a row of another pool, and a row
--   written after the fix are untouched; a second run changes nothing; and the
--   hand stock follows.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

update public.harness set uid = null, email = null;
insert into public.handstock_opening (engineer, part, qty, as_of, source, data) values
 ('ENG W411', 'MP-910|OXYGEN SENSOR', 170, '2022-06-09', 'WinMax HS', '{"Defective Balance":"170.00","Missing Balance":"8.00"}'),
 ('ENG W411', 'EM-951|ORG-FUSE',        7, '2022-06-09', 'WinMax HS', '{"Defective Balance":"2.00"}'),
 ('ENG W411', 'KY-911|SENSOR',          4, '2022-06-09', 'WinMax HS', '{"Defective Balance":""}'),
 ('ENG W411', 'EM-952|FUSE',            9, '2022-06-09', '23',        '{"Defective Balance":"3.00"}');
-- Loaded before the fix: backdate them (the insert trigger stamps updated_at).
alter table public.handstock_opening disable trigger handstock_opening_biu;
update public.handstock_opening set updated_at = '2026-10-01T00:00:00Z' where engineer = 'ENG W411';
alter table public.handstock_opening enable trigger handstock_opening_biu;
-- Loaded AFTER the fix by the corrected upload: good only, defective in data.
insert into public.handstock_opening (engineer, part, qty, as_of, source, data) values
 ('ENG W412', 'EM-951|ORG-FUSE', 5, '2022-06-09', 'WinMax HS', '{"Defective Balance":"2.00"}');

\i supabase/migrations/0411_winmax_opening_good_only.sql

select 'a row whose Good Balance was nothing is removed' as t,
       not exists (select 1 from public.handstock_opening where engineer = 'ENG W411' and part_code = 'MP-910') as ok;
select 'a good + defective row keeps only the good, and records what was taken out' as t,
       (select qty = 5 and (data ->> '_0411_defective_removed')::numeric = 2
          from public.handstock_opening where engineer = 'ENG W411' and part_code = 'EM-951') as ok;
select 'a row with no defective is untouched' as t,
       (select qty = 4 and not data ? '_0411_defective_removed'
          from public.handstock_opening where engineer = 'ENG W411' and part_code = 'KY-911') as ok;
select 'another pool is untouched' as t,
       (select qty = 9 from public.handstock_opening where engineer = 'ENG W411' and part_code = 'EM-952') as ok;
select 'a row written after the fix is untouched' as t,
       (select qty = 5 and not data ? '_0411_defective_removed'
          from public.handstock_opening where engineer = 'ENG W412' and part_code = 'EM-951') as ok;
select 'the hand stock follows: EM-951 opens at the good balance' as t,
       (select opening = 5 from public.handstock_balance
         where engineer_key = public.handstock_key('ENG W411') and part_code = 'EM-951') as ok;

\i supabase/migrations/0411_winmax_opening_good_only.sql
select 'a second run changes nothing' as t,
       (select qty = 5 from public.handstock_opening where engineer = 'ENG W411' and part_code = 'EM-951')
   and (select count(*) = 3 from public.handstock_opening where engineer = 'ENG W411') as ok;
