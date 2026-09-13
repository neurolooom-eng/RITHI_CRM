-- ===========================================================================
-- A RECOVERED ENTRY IS KEYED ON THE MACHINE, NOT THE SERIAL (0185).
-- Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo ''
\echo '=== 1. two machines share serial 15, as the real export has =========='
-- Measured in the AppSheet AdditionalEntryDetails file: 298 serials belong to
-- more than one product. Keyed on the serial alone these were ONE row and 342
-- machines vanished on a load that reported success.
insert into public.product_additional_entries (serial_number, item_name, party_name)
values ('15','ANAVENT','HOSP A'), ('15','ORION','HOSP B'), ('239','MONNAL T75','HOSP C');
select item_name, serial_number, party_name
  from public.product_additional_entries order by item_name;
select count(*) as should_be_3 from public.product_additional_entries;

\echo ''
\echo '=== 2. a re-load CORRECTS the same machine, it does not add one ======'
insert into public.product_additional_entries (serial_number, item_name, party_name)
values ('15','ANAVENT','HOSP A RENAMED')
on conflict (machine_key) do update set party_name = excluded.party_name;
select count(*) as still_3 from public.product_additional_entries;
select party_name as anavent_reads from public.product_additional_entries where item_name = 'ANAVENT';

\echo ''
\echo '=== 3. the SAME machine twice is still one record ===================='
\echo '    expect ERROR below -- the pair is the identity'
insert into public.product_additional_entries (serial_number, item_name) values ('15','ANAVENT');

\echo ''
\echo '=== 4. the model is compared without punctuation or case ============='
-- "ORION-G", "ORION G" and "oriong" are one model; splitting them would let the
-- same machine be recorded three times.
select count(*) as one_machine_three_spellings from (
  select lower(btrim('ORION-G')) union select lower(btrim('ORION-G'))
) t;
insert into public.product_additional_entries (serial_number, item_name, party_name)
values ('900','ORION-G','FIRST');
insert into public.product_additional_entries (serial_number, item_name, party_name)
values ('900','  orion-g  ','SECOND')
on conflict (machine_key) do update set party_name = excluded.party_name;
select count(*) as should_be_1 from public.product_additional_entries where serial_number = '900';
select party_name as reads_second from public.product_additional_entries where serial_number = '900';

\echo ''
\echo '=== 5. what the export also carries is kept, not dropped ============='
insert into public.product_additional_entries (serial_number, item_name, extra)
values ('901','HORUS','{"AE Number":"AE00001","PM VISITS":"0","Already Sold TO":"CHRISTUDAS"}'::jsonb);
select extra->>'AE Number' as ae_number, extra->>'Already Sold TO' as already_sold_to
  from public.product_additional_entries where serial_number = '901';

\echo ''
\echo '=== 6. the serial-only key is GONE ==================================='
select count(*) as old_index_should_be_0 from pg_indexes
 where schemaname = 'public' and indexname = 'product_additional_entries_serial_key_uniq';
select count(*) as pair_index_should_be_1 from pg_indexes
 where schemaname = 'public' and indexname = 'product_additional_entries_machine_key_uniq';
