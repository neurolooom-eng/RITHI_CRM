-- ===========================================================================
-- EVERY TRACE OF ONE MACHINE, AND WHO DECIDES ITS PARTY.   Read-only.
--
-- Asked 2026-10-27 about VEGA | 31: "How is the Master Showing a Different
-- Party when all Sources are Pointing to another Party?"
--
-- THE RULE IT CHECKS. The Product Database's party is the party of whichever
-- is LATEST -- the machine's sale entry or its ownership transfer
-- (machine_current_party(), 0238/0240). Contracts, calls, installation calls,
-- feedback and additional entries name a party too, but none of them decides
-- it. Row 20 says what the rule answers; row 10 says what the Master holds and
-- who last wrote it; the rest is every register that mentions the machine.
--
-- EXACT and NEAR. A machine is its product + serial, compared ignoring case
-- and surrounding spaces. "NEAR" rows are the same product text with the
-- serial's punctuation, spaces and leading zeros ignored ("VEGA 031",
-- "VEGA-31") -- they are NOT this machine to the database, and if the party
-- you expected is only on a NEAR row, that is the answer.
--
-- >>> EDIT THE TWO VALUES IN `ask` AND RUN THE WHOLE FILE. Row 1 first. <<<
-- One grid, rows numbered by section.
-- ===========================================================================

with ask as (
  select 'CHANGE-ME-PRODUCT'::text as product,   -- e.g.  VEGA
         'CHANGE-ME-SERIAL'::text  as serial     -- e.g.  31
),
k as (
  select product, serial, lower(btrim(product)) as p, lower(btrim(serial)) as s,
         regexp_replace(regexp_replace(lower(serial), '[^a-z0-9]', '', 'g'), '^0+', '') as s_sq
    from ask
),
-- how a value is shown: dd-Mon-yyyy HH24:MI:SS, India time
fmt as (select 'DD-Mon-YYYY HH24:MI:SS'::text as f)
select 1 as sort_order, 'what this run searched for' as section,
       'product [' || k.product || ']  serial [' || k.serial || ']' as party,
       case when k.product like 'CHANGE-ME%' or k.serial like 'CHANGE-ME%'
            then 'NOT CHANGED -- edit the two values in `ask` at the top and run it again'
            else 'read this row first, every time' end as detail
  from k
union all
-- 10. THE MASTER -- public.products -- and who last wrote the row.
select 10, 'MASTER (Product Database) ' || case when lower(btrim(p.item_name)) = k.p and lower(btrim(p.serial_number)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(p.party_name, ''),
       '[' || p.item_name || ' | ' || p.serial_number || ']  machine_key ' || coalesce(p.machine_key, '')
       || '  created ' || coalesce(to_char(p.created_at at time zone 'Asia/Kolkata', (select f from fmt)), '-')
       || '  last written ' || coalesce(to_char(p.sys_updated_on at time zone 'Asia/Kolkata', (select f from fmt)), '-')
       || ' by ' || coalesce((select coalesce(nullif(btrim(pr.full_name), ''), pr.email) from public.profiles pr where pr.id = p.sys_updated_by), 'the system / an import')
       || '  address [' || coalesce(p.address, '') || ', ' || coalesce(p.city, '') || ', ' || coalesce(p.state, '') || ']'
  from public.products p, k
 where (lower(btrim(p.item_name)) = k.p and lower(btrim(p.serial_number)) = k.s)
    or (lower(p.item_name) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(p.serial_number, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 20. WHAT THE RULE ANSWERS: the latest of the sale and the transfer.
select 20, 'THE RULE: party of the latest sale entry / ownership transfer',
       coalesce(nullif(public.machine_current_party(k.product, k.serial), ''), '(no sale entry and no transfer -- the rule says nothing; the Master keeps what was imported or uploaded)'),
       'machine_current_party(product, serial)'
  from k
union all
-- 30. SALE ENTRIES (Sale Register; warranty_sale_details is a view of this).
select 30, 'sale entry ' || case when lower(btrim(i.product_name)) = k.p and lower(btrim(i.serial_number)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(h.party_name, ''),
       coalesce(i.sa_number, '') || '  [' || i.product_name || ' | ' || i.serial_number || ']  entry '
       || coalesce(to_char(coalesce(h.entry_at, i.created_at) at time zone 'Asia/Kolkata', (select f from fmt)), '-')
  from public.sale_items i left join public.sale_entries h on h.sa_number = i.sa_number, k
 where (lower(btrim(i.product_name)) = k.p and lower(btrim(i.serial_number)) = k.s)
    or (lower(i.product_name) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(i.serial_number, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 40. OWNERSHIP TRANSFERS.
select 40, 'ownership transfer ' || case when lower(btrim(t.item_name)) = k.p and lower(btrim(t.serial_number)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(t.to_party, ''),
       'from [' || coalesce(t.from_party, '') || ']  [' || t.item_name || ' | ' || t.serial_number || ']  transfer date '
       || coalesce(to_char(t.transfer_date, 'DD-Mon-YYYY'), '-') || '  recorded '
       || coalesce(to_char(coalesce(t.transferred_at, t.created_at, t.transfer_date::timestamptz) at time zone 'Asia/Kolkata', (select f from fmt)), '-')
  from public.ownership_transfers t, k
 where (lower(btrim(t.item_name)) = k.p and lower(btrim(t.serial_number)) = k.s)
    or (lower(t.item_name) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(t.serial_number, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 50. CONTRACTS -- name a party, never decide it.
select 50, 'contract (does not decide the party) ' || case when lower(btrim(c.product_name)) = k.p and lower(btrim(c.serial_number)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(nullif(btrim(coalesce(c.party_name, '')), ''), e.party_name, ''),
       coalesce(c.mc_number, '') || '  [' || c.product_name || ' | ' || c.serial_number || ']  entry '
       || coalesce(to_char(coalesce(e.entry_at, c.created_at) at time zone 'Asia/Kolkata', (select f from fmt)), '-')
  from public.contract_items c left join public.contract_entries e on e.mc_number = c.mc_number, k
 where (lower(btrim(c.product_name)) = k.p and lower(btrim(c.serial_number)) = k.s)
    or (lower(c.product_name) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(c.serial_number, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 60. ADDITIONAL ENTRIES.
select 60, 'additional entry (does not decide the party) ' || case when lower(btrim(a.item_name)) = k.p and lower(btrim(a.serial_number)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(a.party_name, ''),
       '[' || a.item_name || ' | ' || a.serial_number || ']  ' || coalesce(a.source_note, '')
       || '  ' || coalesce(to_char(a.created_at at time zone 'Asia/Kolkata', (select f from fmt)), '-')
  from public.product_additional_entries a, k
 where (lower(btrim(a.item_name)) = k.p and lower(btrim(a.serial_number)) = k.s)
    or (lower(a.item_name) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(a.serial_number, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 70. CALLS -- field, installation and PM.
select 70, x.reg || ' call (does not decide the party) ' || case when lower(btrim(x.product_name)) = k.p and lower(btrim(x.serial)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(x.party_name, ''),
       coalesce(x.ucn, '') || '  [' || x.product_name || ' | ' || x.serial || ']  registered '
       || coalesce(to_char(coalesce(x.reg_at, x.created_at) at time zone 'Asia/Kolkata', (select f from fmt)), '-')
       || case when x.cancelled_at is not null then '  CANCELLED' else '' end
  from (select 'Field' as reg, ucn, product_name, serial, party_name, reg_at, created_at, cancelled_at from public.field_calls
        union all select 'Installation', ucn, product_name, serial, party_name, reg_at, created_at, cancelled_at from public.installation_calls
        union all select 'PM', ucn, product_name, serial, party_name, reg_at, created_at, cancelled_at from public.pm_calls) x, k
 where (lower(btrim(x.product_name)) = k.p and lower(btrim(x.serial)) = k.s)
    or (lower(x.product_name) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(x.serial, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 80. CALL HISTORY (calls before RITHI).
select 80, 'call history (does not decide the party) ' || case when lower(btrim(ch.item_name)) = k.p and lower(btrim(ch.serial)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(ch.party_name, ''),
       coalesce(ch.ucn, '') || '  [' || coalesce(ch.item_name, '') || ' | ' || coalesce(ch.serial, '') || ']  '
       || coalesce(ch.register, '') || '  ' || coalesce(to_char(ch.call_at at time zone 'Asia/Kolkata', (select f from fmt)), '-')
  from public.call_history ch, k
 where (lower(btrim(ch.item_name)) = k.p and lower(btrim(ch.serial)) = k.s)
    or (lower(coalesce(ch.item_name, '')) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(ch.serial, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 90. CALL REGISTRATION REQUESTS.
select 90, 'call request (does not decide the party) ' || case when lower(btrim(r.product)) = k.p and lower(btrim(r.serial_no)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(r.party_name, ''),
       coalesce(r.ucn, '(no call yet)') || '  [' || coalesce(r.product, '') || ' | ' || coalesce(r.serial_no, '') || ']  '
       || coalesce(to_char(r.submitted_at at time zone 'Asia/Kolkata', (select f from fmt)), '-')
  from public.call_requests r, k
 where (lower(btrim(r.product)) = k.p and lower(btrim(r.serial_no)) = k.s)
    or (lower(coalesce(r.product, '')) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(r.serial_no, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 100. CUSTOMER FEEDBACK.
select 100, 'feedback (does not decide the party) ' || case when lower(btrim(f.product_name)) = k.p and lower(btrim(f.serial)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(f.party_name, ''),
       coalesce(f.ucn, '') || '  [' || coalesce(f.product_name, '') || ' | ' || coalesce(f.serial, '') || ']  '
       || coalesce(to_char(coalesce(f.entry_at, f.created_at) at time zone 'Asia/Kolkata', (select f2.f from fmt f2)), '-')
  from public.feedback f, k
 where (lower(btrim(f.product_name)) = k.p and lower(btrim(f.serial)) = k.s)
    or (lower(coalesce(f.product_name, '')) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(f.serial, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
union all
-- 110. PRODUCT DATABASE 2.0 -- assembled from the registers, says which one named the party.
select 110, 'Product Database 2.0 ' || case when lower(btrim(v.product_name)) = k.p and lower(btrim(v.serial_number)) = k.s then 'EXACT' else 'NEAR' end,
       coalesce(v.party_name, ''),
       'party from ' || coalesce(v.party_from, '-') || '  [' || v.product_name || ' | ' || v.serial_number || ']'
  from public.product_database_v2 v, k
 where (lower(btrim(v.product_name)) = k.p and lower(btrim(v.serial_number)) = k.s)
    or (lower(v.product_name) like '%' || k.p || '%'
        and regexp_replace(regexp_replace(lower(coalesce(v.serial_number, '')), '[^a-z0-9]', '', 'g'), '^0+', '') = k.s_sq)
order by 1, 2, 3;
