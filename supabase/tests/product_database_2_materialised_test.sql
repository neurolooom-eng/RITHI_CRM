-- ===========================================================================
-- 0220 — Product Database 2.0 is materialised, and the gate survived it.
--
-- The point of this suite is NOT that the matview is fast (a test cannot
-- assert a timing honestly on someone else's hardware). It is that the two
-- things the speed fix could have broken are still true:
--   1. the READ GATE is the same audience as the registers it reads, and
--   2. the REBUILD is an authorised act.
-- Plus the correctness half: a machine's warranty start is now the same fact
-- for every reader, which is what the definer function is FOR.
-- ===========================================================================
\set ON_ERROR_STOP off

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001','pdv2_admin@x.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002','pdv2_eng@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001','pdv2_admin@x.com','PDV2 Admin','admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002','pdv2_eng@x.com','PDV2 Eng','engineer')
  on conflict (id) do update set role = excluded.role;

-- One machine, in the warranty register, with an installation call that
-- answers the Warranty Start Date question.
set session_replication_role = replica;
insert into public.sale_entries (sa_number, entry_at, party_name)
  values ('SA-PDV2', now(), 'PDV2 Party');
insert into public.sale_items (uid, sa_number, product_code, product_name, serial_number, warranty_start, warranty_months)
  values ('W-PDV2','SA-PDV2','PC-1','PDV2-MODEL','PDV2-9001', date '2024-01-31', 1);
insert into public.installation_calls (ucn, call_type, reg_date, party_name, product_name, serial)
  values ('UCN-PDV2','INSTALLATION', current_date, 'PDV2 Party', 'PDV2-MODEL', 'PDV2-9001');
insert into public.feedback (ucn, answers)
  values ('UCN-PDV2', jsonb_build_object('Warranty Start Date?', '2024-01-31'));
set session_replication_role = origin;

call public.be('pdv2_admin@x.com');
select public.refresh_product_database_2();

-- READ AS THE ADMIN: the gate is a whole-table predicate, so `postgres`
-- with no session identity reads NOTHING here, which is the gate working.
\echo '--- the machine is listed, keyed on product AND serial ---'
select machine_key, product_name, serial_number,
       warranty_start, warranty_end
  from public.product_database_v2 where serial_number = 'PDV2-9001';

\echo '--- 31-Jan + 1 month is 2-MAR minus a day (the addPeriod() overflow, 0218) ---'
select case when warranty_end = date '2024-03-01' then 'PASS' else 'FAIL ' || warranty_end end
  from public.product_database_v2 where serial_number = 'PDV2-9001';

\echo '--- the figures carry the moment they were built ---'
select case when refreshed_at is not null then 'PASS' else 'FAIL' end
  from public.product_database_v2 where serial_number = 'PDV2-9001';

\echo '--- an ENGINEER (no masters.view, no cover.edit) reads NOTHING ---'
call public.be('pdv2_eng@x.com');
set local role authenticated;
select case when count(*) = 0 then 'PASS' else 'FAIL saw ' || count(*) end
  from public.product_database_v2;

\echo 'expect ERROR: an engineer may not rebuild it'
select public.refresh_product_database_2();

reset role;
\echo '--- an ADMIN reads it and may rebuild ---'
call public.be('pdv2_admin@x.com');
set local role authenticated;
select case when count(*) > 0 then 'PASS' else 'FAIL saw nothing' end
  from public.product_database_v2 where serial_number = 'PDV2-9001';
select case when public.refresh_product_database_2() is not null then 'PASS' else 'FAIL' end;
reset role;

\echo '--- THE WARRANTY START IS THE SAME FACT FOR BOTH READERS. That is what the'
\echo '--- definer lookup is for: through the per-row calls policy it was not. ---'
select case when (select warranty_start from public.product_database_v2 where serial_number='PDV2-9001')
              = date '2024-01-31' then 'PASS' else 'FAIL' end;

\echo '--- the matview itself is reachable by NOBODY but the gate ---'
select case when has_table_privilege('authenticated','public.product_database_v2_mv','select')
             then 'FAIL granted' else 'PASS' end;
