-- ===========================================================================
-- DID THE PRODUCT DATABASE'S COLUMNS ACTUALLY FILL?
--
-- Read-only. Run it after `masters.sql` (which carries 0194).
--
-- WHY THIS EXISTS SEPARATELY FROM `_status.sql`. Row 148 there asks whether the
-- twenty-one new COLUMNS exist — and a column can exist and be empty on every
-- one of twenty thousand machines. 0194's backfill reads the values out of
-- `extra`, where the importer had been keeping them all along, and that is the
-- half that can silently do nothing: it fills only a column that is still
-- EMPTY (so it never overwrites a correction somebody made on screen), it reads
-- `extra` and never writes it, and the two dates are GUARDED on their shape
-- because `to_date('rubbish','DD Mon YY')` RAISES rather than returning null.
--
-- The Supabase SQL editor does not show a `raise notice`, so the migration's
-- own "N machine(s) had their kept columns read back out of `extra`" is
-- invisible there. This asks the same question of the rows themselves.
--
-- HOW TO READ IT. `filled` is how many machines have a value in the COLUMN;
-- `still only in extra` is how many have one in `extra` that did NOT reach the
-- column. The second number should be 0 for the text columns. Where it is not
-- 0 for `PO Date` or `INST Date`, those are cells the parser could not read —
-- the sample's own `INST Date` says "To Check" — and they are not lost: the
-- file's own words are still in `extra`, which is where you go to look at them.
-- ===========================================================================

with m as (select count(*)::numeric as total from public.products)
select  c.col                                        as "column",
        c.filled                                     as "filled",
        to_char(100 * c.filled / nullif(m.total, 0), 'FM990.0') || '%'
                                                     as "of all machines",
        c.orphan                                     as "still only in extra"
  from m,
  lateral (
    select 'item_code'              as col,
           count(*) filter (where btrim(coalesce(p.item_code, '')) <> '')          as filled,
           count(*) filter (where btrim(coalesce(p.item_code, '')) = ''
                              and btrim(coalesce(p.extra->>'Item Code', '')) <> '') as orphan
      from public.products p
    union all select 'city',
           count(*) filter (where btrim(coalesce(p.city, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.city, '')) = ''
                              and btrim(coalesce(p.extra->>'City', '')) <> '')
      from public.products p
    union all select 'state',
           count(*) filter (where btrim(coalesce(p.state, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.state, '')) = ''
                              and btrim(coalesce(p.extra->>'State', '')) <> '')
      from public.products p
    union all select 'address',
           count(*) filter (where btrim(coalesce(p.address, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.address, '')) = ''
                              and btrim(coalesce(p.extra->>'Address', '')) <> '')
      from public.products p
    union all select 'po_no',
           count(*) filter (where btrim(coalesce(p.po_no, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.po_no, '')) = ''
                              and btrim(coalesce(p.extra->>'PO No.', '')) <> '')
      from public.products p
    -- A DATE, so the orphans here are the cells the parser could not read.
    union all select 'po_date',
           count(*) filter (where p.po_date is not null),
           count(*) filter (where p.po_date is null
                              and btrim(coalesce(p.extra->>'PO Date', '')) <> '')
      from public.products p
    union all select 'warranty_status_keyed',
           count(*) filter (where btrim(coalesce(p.warranty_status_keyed, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.warranty_status_keyed, '')) = ''
                              and btrim(coalesce(p.extra->>'Warranty Status', '')) <> '')
      from public.products p
    union all select 'contract_status_keyed',
           count(*) filter (where btrim(coalesce(p.contract_status_keyed, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.contract_status_keyed, '')) = ''
                              and btrim(coalesce(p.extra->>'Contract Status', '')) <> '')
      from public.products p
    -- COUNTED, so 0 is a value and NULL is "nobody said". `filled` counts the
    -- rows that have an answer at all, 0 included.
    union all select 'pm_visits',
           count(*) filter (where p.pm_visits is not null),
           count(*) filter (where p.pm_visits is null
                              and btrim(coalesce(p.extra->>'PM Visits', '')) <> '')
      from public.products p
    union all select 'service_engineer',
           count(*) filter (where btrim(coalesce(p.service_engineer, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.service_engineer, '')) = ''
                              and btrim(coalesce(p.extra->>'Service Engineer', '')) <> '')
      from public.products p
    union all select 'installation_completed',
           count(*) filter (where btrim(coalesce(p.installation_completed, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.installation_completed, '')) = ''
                              and btrim(coalesce(p.extra->>'Installation Completed?', '')) <> '')
      from public.products p
    union all select 'inst_date',
           count(*) filter (where p.inst_date is not null),
           count(*) filter (where p.inst_date is null
                              and btrim(coalesce(p.extra->>'INST Date', '')) <> '')
      from public.products p
    union all select 'associated_accessory',
           count(*) filter (where btrim(coalesce(p.associated_accessory, '')) <> ''),
           count(*) filter (where btrim(coalesce(p.associated_accessory, '')) = ''
                              and btrim(coalesce(p.extra->>'Associated Accessory', '')) <> '')
      from public.products p
  ) c
 order by c.filled desc, c.col;
