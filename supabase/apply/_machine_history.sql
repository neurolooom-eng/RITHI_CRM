-- ===========================================================================
-- ONE MACHINE'S WHOLE LIFE — where it is now, and every transaction against it.
--
-- Asked, 2026-09-14: "Analyse ORION-G - 2141 -- Where is the Product? Fetch all
-- Transactions of this Product".
--
-- PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR. It is READ-ONLY. It
-- returns one table: the machine's CURRENT position first, then every
-- transaction anybody recorded against it, oldest first.
--
-- A MACHINE IS ITS MODEL AND ITS SERIAL, NEVER THE SERIAL ALONE. That is this
-- project's own rule (src/lib/machine.ts), written down after an ORION-G 201
-- request was offered an open call for a VEGA 201 — and measured since: in the
-- AdditionalEntryDetails export, 298 serials belong to more than one product,
-- serial 15 is both an ANAVENT and an ORION, serial 239 is four machines. So
-- the model is matched as well, and the PRODUCT IS PRINTED ON EVERY ROW: if a
-- row names a model you did not ask for, the match is too loose and you can see
-- it rather than be misled by it.
--
-- WHERE IT LOOKS. Everything in this system that records a machine:
--   Product Master · cover (warranty/contract as of today) · calls of all three
--   kinds · the visits on them · spares fitted · Field Failure Reports ·
--   customer feedback · sale/warranty lines · contract lines · ownership
--   transfers · additional entries · workshop (indoor) jobs.
--
-- WHAT IT CANNOT SEE: anything before the migration to this system. That lives
-- in the 2016 archive project and is not reachable from here.
-- ===========================================================================

with ask as (
  -- ---- THE MACHINE. Change these two. ------------------------------------
  -- The model is matched LOOSELY (contains, case-insensitive) because it is
  -- spelled several ways across the registers; the serial is matched EXACTLY
  -- once trimmed, because that is the part that identifies the unit.
  select '%ORION%G%'::text as model,
         '2141'::text      as serial
),
m as (select model, upper(btrim(serial)) as serial from ask)

select * from (

  -- ---- 0. WHERE IT IS NOW ---------------------------------------------------
  -- The Product Master is the answer to "where is it": the party it is with,
  -- and the cover it is under.
  select 0 as sort, null::date as "when", 'WHERE IT IS NOW' as source,
         'Product Master' as event,
         coalesce(p.item_name, '') || ' · ' || coalesce(p.serial_number, '') as reference,
         coalesce(p.party_name, '(no party on the master)') as party,
         concat_ws(' · ',
           'status: ' || coalesce(nullif(p.item_status, ''), '—'),
           case when p.warranty_number is not null and p.warranty_number <> ''
                then 'warranty ' || p.warranty_number || ' to ' || coalesce(p.warranty_end::text, '—') end,
           case when p.contract_number is not null and p.contract_number <> ''
                then coalesce(p.contract_type, 'contract') || ' ' || p.contract_number
                     || ' to ' || coalesce(p.contract_end::text, '—') end,
           -- WHAT THE FILE ITSELF SAID (0194). Asked, 2026-09-14: a machine
           -- under warranty showing BOTH a warranty and a contract. Nothing on
           -- the Product Database is computed — no trigger, no generated
           -- column beyond the two matching keys — so if both appear, the
           -- upload carried both. These two are the export's OWN
           -- ACTIVE/INACTIVE words, printed beside the numbers so you can see
           -- whether the FILE already called the contract dead.
           case when coalesce(p.warranty_status_keyed, '') <> ''
                then 'file says warranty ' || p.warranty_status_keyed end,
           case when coalesce(p.contract_status_keyed, '') <> ''
                then 'file says contract ' || p.contract_status_keyed end,
           case when p.active is false then 'MARKED INACTIVE' end) as detail
    from public.products p, m
   where p.item_name ilike m.model and upper(btrim(coalesce(p.serial_number, ''))) = m.serial

  union all
  -- Cover as the system computes it today, which can differ from the master's
  -- own columns — and the difference is worth seeing rather than averaging.
  select 0, null, 'WHERE IT IS NOW', 'Cover today',
         coalesce(c.product_name, '') || ' · ' || coalesce(c.serial_number, ''),
         coalesce(c.party_name, ''),
         concat_ws(' · ',
           'warranty: ' || coalesce(c.warranty_state, '—'),
           'contract: ' || coalesce(c.contract_state, '—'),
           nullif(concat_ws(' ', c.state, c.city), ''),
           case when coalesce(c.engineer, '') <> '' then 'engineer ' || c.engineer end)
    from public.machine_cover c, m
   where c.product_name ilike m.model and upper(btrim(coalesce(c.serial_number, ''))) = m.serial

  -- ---- 1. CALLS, of all three kinds, with the visit that closed them --------
  union all
  select 1, k.reg_date, 'Call', coalesce(k.call_type, 'Call'),
         k.ucn || coalesce(' / ' || nullif(k.call_number, ''), ''),
         coalesce(k.party_name, ''),
         concat_ws(' · ',
           'status: ' || coalesce(nullif(k.open_state, ''), '—'),
           nullif(k.standard_complaint, ''),
           case when coalesce(k.allocated_to, '') <> '' then 'engineer ' || k.allocated_to end,
           case when k.cancelled_at is not null then 'CANCELLED' end)
    from public.calls k, m
   where k.product_name ilike m.model and upper(btrim(coalesce(k.serial, ''))) = m.serial

  -- ---- 2. THE VISITS on those calls ----------------------------------------
  union all
  select 2, coalesce(r.visit_at::date, r.updated_at::date), 'Visit',
         coalesce(nullif(r.call_status, ''), 'visit'),
         r.ucn, coalesce(r.engineer, ''),
         concat_ws(' · ',
           case when r.visit_at is null then 'NO VISIT DATE — entered ' || r.updated_at::date end,
           nullif(r.pending_reason, ''))
    from public.reports r, m
   where r.ucn in (select k.ucn from public.calls k
                    where k.product_name ilike m.model
                      and upper(btrim(coalesce(k.serial, ''))) = m.serial)

  -- ---- 3. SPARES FITTED ----------------------------------------------------
  union all
  select 3, sc.created_at::date, 'Spare fitted',
         btrim(split_part(sc.part, '|', 1)),
         sc.ucn, coalesce(sc.engineer, ''),
         concat_ws(' · ',
           'qty ' || coalesce(sc.qty::text, '0'),
           btrim(substr(sc.part, strpos(sc.part, '|') + 1)),
           case when coalesce(sc.qty, 0) = 0 then 'VOIDED — kept with its original quantity' end)
    from public.spare_consumption sc, m
   where sc.ucn in (select k.ucn from public.calls k
                     where k.product_name ilike m.model
                       and upper(btrim(coalesce(k.serial, ''))) = m.serial)

  -- ---- 4. FIELD FAILURE REPORTS --------------------------------------------
  union all
  select 4, f.ffr_date, 'Field Failure Report', f.ffr_no,
         coalesce(nullif(f.ucn, ''), ''), coalesce(f.customer_name, ''),
         concat_ws(' · ',
           'status: ' || coalesce(nullif(f.ffr_status, ''), '—'),
           nullif(f.problem_reported, ''),
           case when coalesce(f.capa_no, '') <> '' then 'CAPA ' || f.capa_no end,
           case when coalesce(f.imported_from, '') <> '' then 'migrated' end)
    from public.field_failure_reports f, m
   where f.product_name ilike m.model and upper(btrim(coalesce(f.product_serial, ''))) = m.serial

  -- ---- 5. CUSTOMER FEEDBACK ------------------------------------------------
  union all
  select 5, fb.entry_at::date, 'Customer feedback', coalesce(fb.ucn, ''),
         coalesce(fb.call_number, ''), coalesce(fb.party_name, ''),
         concat_ws(' · ',
           nullif(fb.complaint, ''),
           case when coalesce(fb.imported_from, '') <> '' then 'uploaded' else 'entered here' end)
    from public.feedback fb, m
   where fb.product_name ilike m.model and upper(btrim(coalesce(fb.serial, ''))) = m.serial

  -- ---- 6. SOLD, AND THE WARRANTY IT CARRIED --------------------------------
  union all
  select 6, w.sale_entry_date::date, 'Sale / warranty', w.sa_number,
         coalesce(w.invoice_no, ''), coalesce(w.party_name, ''),
         concat_ws(' · ',
           'warranty ' || coalesce(w.warranty_start::text, '—') || ' to ' || coalesce(w.warranty_end::text, '—'),
           'state: ' || coalesce(w.warranty_state, '—'),
           case when coalesce(w.already_sold_to, '') <> '' then 'already sold to ' || w.already_sold_to end)
    from public.warranty_sale_details w, m
   where w.product_name ilike m.model and upper(btrim(coalesce(w.serial_number, ''))) = m.serial

  -- ---- 7. CONTRACTS --------------------------------------------------------
  union all
  select 7, ct.contract_start, 'Contract', ct.mc_number,
         coalesce(ct.contract_type, ''), coalesce(ct.party_name, ''),
         concat_ws(' · ',
           coalesce(ct.contract_start::text, '—') || ' to ' || coalesce(ct.contract_end::text, '—'),
           'state: ' || coalesce(ct.contract_state, '—'),
           case when coalesce(ct.prev_mc_number, '') <> '' then 'renewed from ' || ct.prev_mc_number end)
    from public.contract_details ct, m
   where ct.product_name ilike m.model and upper(btrim(coalesce(ct.serial_number, ''))) = m.serial

  -- ---- 8. OWNERSHIP TRANSFERS ----------------------------------------------
  union all
  select 8, ot.transfer_date, 'Ownership transfer', coalesce(ot.reference_no, ''),
         coalesce(nullif(ot.from_party, ''), '(not stated)') || ' → ' || coalesce(ot.to_party, ''),
         coalesce(ot.to_party, ''),
         concat_ws(' · ', nullif(ot.reason, ''), nullif(ot.remarks, ''))
    from public.ownership_transfers ot, m
   where ot.item_name ilike m.model and upper(btrim(coalesce(ot.serial_number, ''))) = m.serial

  -- ---- 9. ADDITIONAL ENTRIES -----------------------------------------------
  union all
  select 9, ae.created_at::date, 'Additional entry', coalesce(ae.warranty_number, ''),
         coalesce(ae.contract_number, ''), coalesce(ae.party_name, ''),
         concat_ws(' · ', nullif(ae.source_note, ''), nullif(ae.remarks, ''))
    from public.product_additional_entries ae, m
   where ae.item_name ilike m.model and upper(btrim(coalesce(ae.serial_number, ''))) = m.serial

  -- ---- 10. WORKSHOP (INDOOR SERVICE) ---------------------------------------
  union all
  select 10, ij.received_at::date, 'Workshop job', coalesce(ij.job_no, ''),
         coalesce(ij.ucn, ''), coalesce(ij.party_name, ''),
         concat_ws(' · ',
           'status: ' || coalesce(nullif(ij.status, ''), '—'),
           nullif(ij.activity, ''), nullif(ij.work_done, ''),
           case when coalesce(ij.disposition, '') <> '' then 'disposition: ' || ij.disposition end)
    from public.indoor_jobs ij, m
   where ij.product_name ilike m.model and upper(btrim(coalesce(ij.serial, ''))) = m.serial

) t
order by sort, "when" nulls first, source;
