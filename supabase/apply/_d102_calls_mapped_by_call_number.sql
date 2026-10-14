-- ===========================================================================
-- D-102: WHICH MACHINES DID 0319 MAP BY CALL NUMBER, AND DOES THE CALL AGREE?
-- (read-only, one grid)
--
-- 0319 (the one-time installation-call mapping, 2026-10-02) mapped a warranty
-- machine line to an installation call by three rules, strongest first. Rule 1
-- matched the call's CALL NUMBER to WI-<Product>-<Serial> of the machine line
-- and did NOT compare the call's own Product and Serial with the machine. So a
-- call numbered WI-VEGA-IC1 whose Serial field says OTHERSERIAL was mapped to
-- machine VEGA IC1 -- and the shipped test expects exactly that.
--
-- Two other parts of the system read the same call by its OWN product and
-- serial, and so put it on a different machine:
--   * Product Database 2.0 and the installation warranty start
--     (machine_install_start()) attach the call to OTHERSERIAL;
--   * link_install_call() -- the screen's "map this call" -- refuses that very
--     pairing ("is not an installation call for VEGA · IC1").
-- And a signed-in user cannot clear a mapped call (sale_item_inst_call_guard,
-- 0234), so a wrong one stays until it is corrected in SQL.
--
-- Rows 1-9 count it; rows 101+ list up to 300 such machines, the call beside
-- the machine. VERDICT per machine:
--   agrees            the call's product and serial ARE the machine's
--   serial differs    same product, another serial on the call
--   product differs   same serial, another product on the call
--   both differ       neither matches
--   call has no serial / no product   the call's own field is blank
-- Nothing here writes. Row 1 says whether 0319 has run on this project.
-- ===========================================================================
with ran as (
  select case when to_regclass('public.one_time_fixes_done') is null then null
              else (xpath('/row/d/text()', query_to_xml(
                     'select detail as d from public.one_time_fixes_done where name = ''0319_install_call_mapping''',
                     false, true, '')))[1]::text
         end as detail
),
-- The LATEST rule-1 change per machine line (a line is logged once by 0319).
m as (
  select distinct on (l.sale_item_id)
         l.sale_item_id, l.sa_number, l.product_name, l.serial_number, l.new_value as ucn, l.changed_at
    from public.inst_call_repair_log l
   where l.why like 'mapped by call number WI-%'
   order by l.sale_item_id, l.changed_at desc, l.id desc
),
j as (
  select m.*, si.inst_call as inst_call_now,
         c.call_number, c.product_name as c_product, c.serial as c_serial, c.party_name as c_party,
         coalesce(h.party_name, '') as sale_party,
         case
           when c.ucn is null then 'call no longer exists'
           when btrim(coalesce(c.serial, '')) = '' then 'call has no serial'
           when btrim(coalesce(c.product_name, '')) = '' then 'call has no product'
           when lower(btrim(c.product_name)) = lower(btrim(m.product_name))
            and lower(btrim(c.serial)) = lower(btrim(m.serial_number)) then 'agrees'
           when lower(btrim(c.product_name)) = lower(btrim(m.product_name)) then 'serial differs'
           when lower(btrim(c.serial)) = lower(btrim(m.serial_number)) then 'product differs'
           else 'both differ'
         end as verdict
    from m
    left join public.sale_items si on si.id = m.sale_item_id
    left join public.sale_entries h on h.sa_number = si.sa_number
    left join public.calls c on c.ucn = m.ucn
),
-- For a call that disagrees: the warranty line for the machine the call's OWN
-- product and serial name, if there is one, and whether it has a call of its own.
k as (
  select j.*, o.id as other_line, coalesce(o.inst_call, '') as other_inst_call
    from j
    left join lateral (
      select x.id, x.inst_call from public.sale_items x
       where x.id <> j.sale_item_id
         and lower(btrim(coalesce(x.product_name, ''))) = lower(btrim(coalesce(j.c_product, '')))
         and lower(btrim(coalesce(x.serial_number, ''))) = lower(btrim(coalesce(j.c_serial, '')))
       order by x.id limit 1) o on j.verdict not in ('agrees', 'call no longer exists', 'call has no serial', 'call has no product')
)
select 1 as row, '0319 has run on this project' as check,
       coalesce((select detail from ran), 'NO -- nothing below can be non-zero') as value
union all
select 2, 'machine lines 0319 mapped by call number (rule 1)', count(*)::text from k
union all
select 3, '... the call''s own product and serial agree', count(*) filter (where verdict = 'agrees')::text from k
union all
select 4, '... the call''s SERIAL is another machine''s (same product)', count(*) filter (where verdict = 'serial differs')::text from k
union all
select 5, '... the call''s PRODUCT differs (same serial)', count(*) filter (where verdict = 'product differs')::text from k
union all
select 6, '... both differ, or the call''s product / serial is blank, or the call is gone',
       count(*) filter (where verdict in ('both differ', 'call has no serial', 'call has no product', 'call no longer exists'))::text from k
union all
select 7, 'of the ones that disagree (4-6), still mapped as 0319 left them',
       count(*) filter (where verdict <> 'agrees' and upper(btrim(coalesce(inst_call_now, ''))) = upper(btrim(ucn)))::text from k
union all
select 8, 'of those, a warranty line exists for the machine the CALL names',
       count(*) filter (where verdict <> 'agrees' and other_line is not null)::text from k
union all
select 9, '... and that line has no installation call of its own',
       count(*) filter (where verdict <> 'agrees' and other_line is not null and btrim(other_inst_call) = '')::text from k
union all
select * from (
  select 100 + row_number() over (order by verdict = 'agrees', sa_number, serial_number)::int,
         coalesce(sa_number, '') || ' · ' || coalesce(product_name, '') || ' · ' || coalesce(serial_number, ''),
         verdict || ' -- ' || ucn || ' (' || coalesce(nullif(btrim(call_number), ''), 'no call number') || ')'
           || ' says ' || coalesce(nullif(btrim(c_product), ''), '?') || ' · ' || coalesce(nullif(btrim(c_serial), ''), '?')
           || ' for ' || coalesce(nullif(btrim(c_party), ''), '?') || '; sale party ' || coalesce(nullif(btrim(sale_party), ''), '?')
           || case when other_line is null then ''
                   when btrim(other_inst_call) = '' then '; a warranty line for the call''s machine exists, with NO call'
                   else '; a warranty line for the call''s machine exists, with call ' || other_inst_call end
           || case when upper(btrim(coalesce(inst_call_now, ''))) <> upper(btrim(ucn))
                   then '; NOW mapped to ' || coalesce(nullif(btrim(inst_call_now), ''), 'nothing') else '' end
    from k
   where verdict <> 'agrees'
   order by 1
   limit 300
) d
order by 1;
