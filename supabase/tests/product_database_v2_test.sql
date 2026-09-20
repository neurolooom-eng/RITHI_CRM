-- ===========================================================================
-- PRODUCT DATABASE 2.0 (0218) — the derivation, case by case.
--
--   psql ... -f supabase/tests/product_database_v2_test.sql
--
-- Every rule the user stated, and the three places this view deliberately
-- disagrees with `machine_cover`. Each check prints PASS or raises.
-- ===========================================================================
\set ON_ERROR_STOP on
\pset pager off
begin;

-- ---------------------------------------------------------------------------
-- 1. THE PERIOD RULE, against the application's own arithmetic.
-- ---------------------------------------------------------------------------
\echo '--- 1. a period ends the day before its anniversary, with JS month overflow ---'
do $$
begin
  -- 12 months from 15-Mar-2026 -> 14-Mar-2027.
  if public.cover_period_end(date '2026-03-15', 12) <> date '2027-03-14' then
    raise exception 'FAIL: a plain 12-month period is wrong';
  end if;
  -- 1 month from 31-Jan -> 2-Mar (Feb 31 rolls forward, as addPeriod does).
  -- Postgres''s own `+ interval ''1 month''` would clamp to 28-Feb and give
  -- 27-Feb, disagreeing with every end date the app has ever computed.
  if public.cover_period_end(date '2026-01-31', 1) <> date '2026-03-02' then
    raise exception 'FAIL: month-end overflow does not match addPeriod()';
  end if;
  if public.cover_period_end(date '2026-01-31', 1)
     = ((date '2026-01-31' + make_interval(months => 1))::date - 1) then
    raise exception 'FAIL: the naive rule now agrees, so this test proves nothing';
  end if;
  if public.cover_period_end(null, 12) is not null
     or public.cover_period_end(date '2026-01-01', 0) is not null then
    raise exception 'FAIL: no start or no period must give no end';
  end if;
  raise notice 'PASS: the period rule matches the application, including 31-Jan';
end $$;

-- ---------------------------------------------------------------------------
-- 2. THE CONTRACT VOCABULARY.
-- ---------------------------------------------------------------------------
\echo '--- 2. labour -> AMC, comprehensive -> CMC, anything else unchanged ---'
do $$
declare bad text;
begin
  select string_agg(t.src || ' -> ' || coalesce(public.contract_cover_code(t.src), '(null)'), ', ')
    into bad
    from (values ('Labour'), ('LABOR'), ('labour contract'), ('AMC'), ('amc')) t(src)
   where public.contract_cover_code(t.src) is distinct from 'AMC';
  if bad is not null then raise exception 'FAIL: labour family did not map to AMC -- %', bad; end if;

  select string_agg(t.src || ' -> ' || coalesce(public.contract_cover_code(t.src), '(null)'), ', ')
    into bad
    from (values ('Comprehensive'), ('CMC'), ('comprehensive maintenance contract')) t(src)
   where public.contract_cover_code(t.src) is distinct from 'CMC';
  if bad is not null then raise exception 'FAIL: comprehensive family did not map to CMC -- %', bad; end if;

  -- NEVER BUCKETED. An unrecognised type comes back as it was, so the odd value
  -- gets reported instead of quietly becoming a comprehensive contract.
  if public.contract_cover_code('Spare Parts Only') <> 'Spare Parts Only' then
    raise exception 'FAIL: an unrecognised contract type was bucketed';
  end if;
  if public.contract_cover_code('') is not null or public.contract_cover_code(null) is not null then
    raise exception 'FAIL: a blank type must be null, not a guess';
  end if;
  raise notice 'PASS: the contract vocabulary maps two families and guesses at nothing';
end $$;

-- ---------------------------------------------------------------------------
-- FIXTURES — five machines, each isolating one rule.
-- ---------------------------------------------------------------------------
insert into public.sale_entries (sa_number, party_name, entry_at)
 values ('SA-1', 'ALPHA HOSPITAL', now() - interval '3 years');
insert into public.sale_items (uid, sa_number, product_name, serial_number, warranty_start, warranty_months)
 values
 -- M1: in warranty AND under contract -> must read WGP (warranty first).
 ('SI-1','SA-1','ORION-G','1001', current_date - 30, 24),
 -- M2: warranty long expired, under a LABOUR contract -> AMC.
 ('SI-2','SA-1','ORION-G','1002', current_date - 2000, 12),
 -- M3: warranty expired, contract expired -> OGP.
 ('SI-3','SA-1','ORION-G','1003', current_date - 2000, 12),
 -- M5: SAME SERIAL as M1, DIFFERENT MODEL. Must stay a separate machine.
 ('SI-5','SA-1','VEGA','1001',    current_date - 2000, 12);

insert into public.contract_entries (mc_number, party_name, contract_type, contract_start, contract_end)
 values ('MC-1','ALPHA HOSPITAL','Comprehensive', current_date - 10, current_date + 300),
        ('MC-2','BETA TRUST',    'Labour',        current_date - 10, current_date + 300),
        ('MC-3','ALPHA HOSPITAL','Comprehensive', current_date - 900, current_date - 500),
        ('MC-4','GAMMA CARE',    '',              current_date - 10, current_date + 300);
insert into public.contract_items (uid, mc_number, product_name, serial_number, party_name, contract_type, contract_start, contract_end)
 values ('CI-1','MC-1','ORION-G','1001','ALPHA HOSPITAL','Comprehensive', current_date - 10, current_date + 300),
        ('CI-2','MC-2','ORION-G','1002','BETA TRUST',    'Labour',        current_date - 10, current_date + 300),
        ('CI-3','MC-3','ORION-G','1003','ALPHA HOSPITAL','Comprehensive', current_date - 900, current_date - 500),
        ('CI-4','MC-4','ORION-G','1004','GAMMA CARE',    '',              current_date - 10, current_date + 300);

-- M6: known ONLY to Additional Entries — neither register has it.
insert into public.product_additional_entries (item_name, serial_number, party_name, warranty_start, warranty_end, recorded_by_name)
 values ('MONNAL','2001','DELTA CLINIC', current_date - 10, current_date + 100, 'tester');

-- M2 changed hands. The transfer is LATER than the sale, EARLIER than MC-2.
insert into public.ownership_transfers (item_name, serial_number, from_party, to_party, transfer_date, reference_no)
 values ('ORION-G','1002','ALPHA HOSPITAL','BETA TRUST', current_date - 400, 'OT-1'),
 -- M3 changed hands and NOTHING later says otherwise -> the transfer decides.
        ('ORION-G','1003','ALPHA HOSPITAL','EPSILON LAB', current_date - 20, 'OT-2');

\echo '--- 3. the assembled rows ---'
select serial_number, product_name, party_name, party_from, item_status, item_status_reason
  from public.product_database_v2 order by product_name, serial_number;

do $$
declare r record;
begin
  -- 3a. WARRANTY FIRST. M1 is inside both; `machine_cover` would answer CMC.
  select * into r from public.product_database_v2
   where machine_key = public.machine_key('ORION-G','1001');
  if r.item_status <> 'WGP' then
    raise exception 'FAIL: a machine inside warranty AND contract read % -- warranty must win', r.item_status;
  end if;
  if (select item_status from public.machine_cover where serial_key = '1001') = 'WGP' then
    raise notice 'NOTE: machine_cover agrees here, so this case no longer shows the difference';
  end if;

  -- 3b. LABOUR -> AMC, and the PARTY comes from the latest dated evidence,
  -- which is the CONTRACT (day -10), not the ownership transfer (day -400).
  select * into r from public.product_database_v2
   where machine_key = public.machine_key('ORION-G','1002');
  if r.item_status <> 'AMC' then
    raise exception 'FAIL: a labour contract read % rather than AMC', r.item_status;
  end if;
  if r.party_name <> 'BETA TRUST' or r.party_from not like 'Contract%' then
    raise exception 'FAIL: the party should come from the later contract, got % from %', r.party_name, r.party_from;
  end if;

  -- 3c. OGP, and here the OWNERSHIP TRANSFER is the latest word.
  select * into r from public.product_database_v2
   where machine_key = public.machine_key('ORION-G','1003');
  if r.item_status <> 'OGP' then
    raise exception 'FAIL: expired warranty and expired contract read %', r.item_status;
  end if;
  if r.party_name <> 'EPSILON LAB' or r.party_from not like 'Ownership transfer%' then
    raise exception 'FAIL: the transfer should decide the party, got % from %', r.party_name, r.party_from;
  end if;

  -- 3d. A CONTRACT WITH NO TYPE IS NOT GUESSED AT.
  select * into r from public.product_database_v2
   where machine_key = public.machine_key('ORION-G','1004');
  if r.item_status <> 'CONTRACT (TYPE NOT RECORDED)' then
    raise exception 'FAIL: a typeless contract read % -- it must not become CMC', r.item_status;
  end if;

  -- 3e. ADDITIONAL ENTRIES put a machine in that neither register knows.
  select * into r from public.product_database_v2
   where machine_key = public.machine_key('MONNAL','2001');
  if r.item_status <> 'WGP' or not r.in_additional_entries or r.in_warranty_register then
    raise exception 'FAIL: the recovered machine is wrong -- status %, additional %, warranty %',
      r.item_status, r.in_additional_entries, r.in_warranty_register;
  end if;

  -- 3f. PRODUCT + SERIAL, NEVER THE SERIAL ALONE. Two models share serial 1001.
  if (select count(*) from public.product_database_v2 where serial_number = '1001') <> 2 then
    raise exception 'FAIL: serial 1001 is two machines and this view merged them';
  end if;
  if (select count(*) from public.machine_cover where serial_key = '1001') <> 1 then
    raise notice 'NOTE: machine_cover no longer merges them, so that gap has been closed elsewhere';
  end if;

  raise notice 'PASS: warranty beats contract, labour is AMC, a typeless contract is flagged,';
  raise notice '      the latest dated evidence names the party, and one serial is two machines';
end $$;

-- ---------------------------------------------------------------------------
-- 4. THE INSTALLATION CALL DECIDES WHEN THE WARRANTY STARTS.
-- ---------------------------------------------------------------------------
\echo '--- 4. the installation call decides the warranty start ---'
insert into public.installation_calls (ucn, call_number, product_name, serial, party_name, call_type)
 values ('INST-1','CN-1','ORION-G','3001','ZETA HOSPITAL','INSTALLATION'),
        ('INST-2','CN-2','ORION-G','3002','ZETA HOSPITAL','INSTALLATION'),
        ('INST-3','CN-3','ORION-G','3003','ZETA HOSPITAL','INSTALLATION');
insert into public.sale_items (uid, sa_number, product_name, serial_number, warranty_start, warranty_months)
 values ('SI-6','SA-1','ORION-G','3001', current_date - 500, 24),
        ('SI-7','SA-1','ORION-G','3002', current_date - 500, 24),
        ('SI-8','SA-1','ORION-G','3003', current_date - 500, 24);
-- 3001: the question was ANSWERED -> that date wins over the sale register's.
insert into public.feedback (ucn, call_type, answers)
 values ('INST-1','INSTALLATION', jsonb_build_object('Warranty Start Date?', (current_date - 10)::text)),
-- 3003: the answer is NOT A DATE. It must be ignored, not raise.
        ('INST-3','INSTALLATION', jsonb_build_object('Warranty Start Date?', 'n/a'));
-- 3002: no answer at all -> the call's SOLVED date is the fallback.
update public.installation_calls
   set last_visit_at = (current_date - 20)::timestamptz, last_status = 'Solved'
 where ucn = 'INST-2';

do $$
declare r record;
begin
  select * into r from public.product_database_v2 where machine_key = public.machine_key('ORION-G','3001');
  if r.warranty_start <> current_date - 10 or r.warranty_from not like 'Installation call%' then
    raise exception 'FAIL: the answered date should start the warranty, got % from %', r.warranty_start, r.warranty_from;
  end if;
  -- ...and the END is DERIVED from it plus the sale register's period.
  if r.warranty_end <> public.cover_period_end(current_date - 10, 24) then
    raise exception 'FAIL: the end was not derived from the answered start plus the period';
  end if;

  select * into r from public.product_database_v2 where machine_key = public.machine_key('ORION-G','3002');
  if r.warranty_start <> current_date - 20 or r.warranty_from not like '%solved date%' then
    raise exception 'FAIL: with no answer the solved date should start it, got % from %', r.warranty_start, r.warranty_from;
  end if;

  -- A CELL HOLDING "n/a" MUST NOT TAKE THE VIEW DOWN, and must not be read as
  -- a date either: this machine falls back to the sale register.
  select * into r from public.product_database_v2 where machine_key = public.machine_key('ORION-G','3003');
  if r.warranty_start <> current_date - 500 then
    raise exception 'FAIL: an unreadable answer should fall through to the register, got %', r.warranty_start;
  end if;
  raise notice 'PASS: answered > solved date > register, and "n/a" neither reads as a date nor breaks the view';
end $$;

\echo '--- 5. every machine, one row each ---'
select count(*) as machines,
       count(*) filter (where item_status = 'WGP') as wgp,
       count(*) filter (where item_status = 'AMC') as amc,
       count(*) filter (where item_status = 'CMC') as cmc,
       count(*) filter (where item_status = 'OGP') as ogp,
       count(*) filter (where item_status like 'CONTRACT%') as flagged
  from public.product_database_v2;

rollback;
