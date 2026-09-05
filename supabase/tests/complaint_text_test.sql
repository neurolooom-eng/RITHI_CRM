-- ===========================================================================
-- Helping the Reported Problem keep the register's house style (0107).
--   The alarm number comes back in the PRODUCT'S OWN spelling, whatever form
--   it was typed in — and an alarm the product does not have is called out
--   rather than silently accepted.
--   The phrasings offered are ones the register has actually used more than
--   once, on this product.
--   An engineer gets the same help as an administrator (SECURITY DEFINER),
--   while learning nothing about a call they may not see.
-- Superuser bypasses RLS, so the scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('d1d1d1d1-0000-0000-0000-000000000001','ct_boss@x.com'),
 ('d1d1d1d1-0000-0000-0000-000000000002','ct_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('d1d1d1d1-0000-0000-0000-000000000001','ct_boss@x.com','CT Boss','admin'),
 ('d1d1d1d1-0000-0000-0000-000000000002','ct_eng@x.com','CT Engineer','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;

-- The fixtures are AN ADMIN'S calls, not the engineer's. Stamping them with
-- whoever the harness happened to be left as is how a re-run of this file
-- quietly turned test 10 green against itself: `created_by = auth.uid()` is one
-- of the arms the read policy allows.
call public.be('ct_boss@x.com');

-- The curated alarm list, as the DCCR masters carry it: the product spells it
-- one way, the common list another, and the product's own spelling must win.
-- ('ALARM 012','COMM') is already there from 0046 — the real common list —
-- which is exactly the collision this has to resolve.
insert into public.masters (name, value, extra) values
  ('dccrgrouping', 'Alarm 012', jsonb_build_object('product','CTPROD')),
  ('dccrgrouping', 'Alarm 045', jsonb_build_object('product','CTPROD')),
  ('dccrgrouping', 'Leak : expiratory valve', jsonb_build_object('product','CTPROD'))
on conflict do nothing;

-- Past calls: seven written one way, two another, one a one-off.
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
select 'CT'||g, 'FIELD', 'CTPROD', g::text, current_date - g, 'HOSP',
       'Alarm 012 low pressure air supply', 'CT-1', 'Someone Else'
  from generate_series(1,7) g
union all
select 'CTB'||g, 'FIELD', 'CTPROD', (100+g)::text, current_date - g, 'HOSP',
       'Air supply pressure low, alarm on screen', 'CT-1', 'Someone Else'
  from generate_series(1,2) g
union all
select 'CTC1', 'FIELD', 'CTPROD', '200', current_date, 'HOSP',
       'air pressure thing not ok alarm coming', 'CT-1', 'Someone Else';

grant select on public.harness to authenticated;

\echo '--- 1. "al 12" comes back in the PRODUCT''S spelling, not the common one ---'
\echo 'expect: Alarm 012 (not ALARM 012), kind = alarm'
select value, kind, why from public.suggest_complaint_text('al 12 air supply low','CTPROD',5)
 where kind = 'alarm';

\echo '--- 2. every form people type it in reaches the same value ---'
\echo 'expect: Alarm 012 on all four rows'
select f as typed, (select value from public.suggest_complaint_text(f,'CTPROD',5) where kind='alarm') as canonical
  from (values ('alarm12 on screen'),('AL-012 raised'),('Alarm  12 seen'),('al.12 air')) t(f);

\echo '--- 3. ...and is NOT offered when it is already written correctly ---'
\echo 'expect: no alarm row'
select count(*) as alarm_rows from public.suggest_complaint_text('Alarm 012 low pressure air supply','CTPROD',5)
 where kind = 'alarm';

\echo '--- 4. an alarm the product does not have is CALLED OUT ---'
\echo 'expect: one unknown row naming alarm 987'
select value, kind, why from public.suggest_complaint_text('alarm 987 on the machine','CTPROD',5)
 where kind = 'unknown';

\echo '--- 5. ...but says nothing for a product with no curated alarm list ---'
\echo 'expect: 0 rows'
select count(*) as unknown_rows from public.suggest_complaint_text('alarm 987 on the machine','NOLISTPROD',5)
 where kind = 'unknown';

\echo '--- 6. the phrasing the register actually uses, counted ---'
\echo 'expect: the 7-call wording ranked above the 2-call one; the one-off absent'
select value, used, why from public.suggest_complaint_text('air supply pressure low','CTPROD',6)
 where kind = 'phrase';

\echo '--- 7. a wording used ONCE is somebody''s sentence, not a house style ---'
\echo 'expect: 0 rows'
select count(*) as oneoffs from public.suggest_complaint_text('air supply pressure low','CTPROD',6)
 where kind = 'phrase' and used < 2;

\echo '--- 8. the product scopes it: another product sees none of this ---'
\echo 'expect: 0 rows'
select count(*) as rows_for_other from public.suggest_complaint_text('air supply pressure low','OTHERPROD',6)
 where kind = 'phrase';

\echo '--- 9. an ENGINEER owning none of those calls gets the same help ---'
\echo 'expect: identical to 6 — the point of SECURITY DEFINER'
call public.be('ct_eng@x.com');
begin;
  set local role authenticated;
  select value, used from public.suggest_complaint_text('air supply pressure low','CTPROD',6)
   where kind = 'phrase';
commit;

\echo '--- 10. ...and still cannot read the calls those counts came from ---'
\echo 'expect: 0 calls visible'
begin;
  set local role authenticated;
  select count(*) as calls_visible from public.calls where product_name = 'CTPROD';
commit;

\echo '--- 11. cleanup, so a re-run starts where this one did ---'
delete from public.field_calls where ucn like 'CT%';
delete from public.masters where name = 'dccrgrouping' and extra->>'product' = 'CTPROD';
delete from public.profiles where email in ('ct_boss@x.com','ct_eng@x.com');
