-- ===========================================================================
-- WHAT THE ONE-TIME PARTY MAPPING CHANGED (0457).   Read-only.
--
-- 0457 re-wrote every machine whose Product Database party was not the party
-- of its latest sale entry or ownership transfer (the user, 2026-10-27:
-- "Do a 1 Time Mapping as per the Actual Logic"). It kept what each machine
-- showed before in products_party_remap_backup. This lists it: row 1 the
-- totals, rows 2-3 how many were decided by a sale and by a transfer, then
-- one row per machine -- what it showed, what it shows now, and which event
-- decided it. Nothing to edit; run the whole file. One grid.
--
-- Needs the service role or the SQL editor (the backup has no policy).
-- ===========================================================================
select 1 as sort_order, 'machines re-mapped' as what, count(*)::text as before_party,
       coalesce((select 'ran ' || to_char(f.applied_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') || ' -- ' || f.detail
                   from public.one_time_fixes_done f where f.name = '0457_product_party_follows_latest_owner'),
                'the mapping has not run -- apply 0457') as now_party,
       '' as decided_by, '' as machine
  from public.products_party_remap_backup
union all
select 2, 'decided by a sale entry', count(*)::text, '', '', ''
  from public.products_party_remap_backup where decided_by like 'Sale entry%'
union all
select 3, 'decided by an ownership transfer', count(*)::text, '', '', ''
  from public.products_party_remap_backup where decided_by like 'Ownership transfer%'
union all
select 100 + (row_number() over (order by b.machine_key))::int, 'machine',
       coalesce(b.old_party, '') || '  [' || concat_ws(', ', nullif(b.old_address, ''), nullif(b.old_city, ''), nullif(b.old_state, '')) || ']',
       coalesce(p.party_name, '(row gone)') || '  [' || concat_ws(', ', nullif(p.address, ''), nullif(p.city, ''), nullif(p.state, '')) || ']',
       coalesce(b.decided_by, ''),
       coalesce(p.item_name || ' | ' || p.serial_number, b.machine_key)
  from public.products_party_remap_backup b
  left join public.products p on p.machine_key = b.machine_key
order by 1;
