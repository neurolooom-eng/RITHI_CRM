-- ===========================================================================
-- An import is a record, not a request (0089).
--   The shortfall guards -- consumption cap, transfer stock check, MRN return
--   check -- are controls on ENTRY. A row loaded from the sheet era says what
--   already happened, and the issues that covered it may be in a file that is
--   not loaded yet. So a row carrying an import provenance is exempt from the
--   shortfall check AND FROM NOTHING ELSE.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values ('11111111-1111-1111-1111-111111111111','admin@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','Rithi Admin','admin');
update public.harness set uid='11111111-1111-1111-1111-111111111111', email='admin@x.com';

\echo '--- 1. nobody holds any stock at all ---'
select count(*) as movements from public.handstock_movements;

\echo '--- 2. a HAND-ENTERED consumption is still capped (expect ERROR) ---'
insert into public.spare_consumption (engineer, part, qty, ucn) values ('RAVI','MP-010|SENSOR',1,'26A02F0001');

\echo '--- 3. an IMPORTED one loads: it carries the export row id ---'
insert into public.spare_consumption (engineer, part, qty, ucn, source_ref)
values ('RAVI','MP-010|SENSOR',1,'26A02F0001','C1-9f3a2b');
select engineer, part, qty, source_ref from public.spare_consumption;

\echo '--- 4. ...but a zero quantity is still refused, import or not (expect ERROR) ---'
insert into public.spare_consumption (engineer, part, qty, source_ref)
values ('RAVI','MP-010|SENSOR',0,'C1-0000');

\echo '--- 5. a transfer made HERE is still checked against the stock (expect ERROR) ---'
insert into public.stock_transfers (uid, from_engineer, to_engineer) values ('ST-APP','RAVI','MEGHA');
insert into public.stock_transfer_lines (transfer_uid, part, qty) values ('ST-APP','MP-010|SENSOR',5);

\echo '--- 6. an IMPORTED transfer is not ---'
insert into public.stock_transfers (uid, from_engineer, to_engineer, source) values ('ST-OLD','RAVI','MEGHA','import');
insert into public.stock_transfer_lines (transfer_uid, part, qty) values ('ST-OLD','MP-010|SENSOR',5);
select t.uid, t.source, l.part, l.qty from public.stock_transfer_lines l join public.stock_transfers t on t.uid=l.transfer_uid;

\echo '--- 7. an imported MRN loads; and its leftovers have somewhere to go ---'
insert into public.material_returns (part, engineer, good_qty, defective_qty, source, extra)
values ('KY632200|HOT WIRE SENSOR','SHANKAR',1,0,'import','{"SI Number":"7"}'::jsonb);
select engineer, part, good_qty, source, extra->>'SI Number' as si from public.material_returns;

\echo '--- 8. a return entered HERE is still checked (expect ERROR) ---'
insert into public.material_returns (part, engineer, good_qty, defective_qty)
values ('KY632200|HOT WIRE SENSOR','SHANKAR',1,0);
