-- Read-only: what a one-time fill of the Product Database's INST columns from
-- Call History (and live installation calls) would do. One grid.
with ht as (
  select call_type, count(*) n from public.call_history group by call_type order by n desc limit 8
), hi as (   -- the historical installation calls
  select h.*, lower(btrim(coalesce(h.item_name,''))) || '|' || lower(btrim(coalesce(h.serial,''))) as mk
    from public.call_history h
   where upper(coalesce(h.call_type,'')) like 'INST%'
), li as (   -- the live installation calls
  select lower(btrim(coalesce(c.product_name,''))) || '|' || lower(btrim(coalesce(c.serial,''))) as mk, c.ucn
    from public.installation_calls c where c.cancelled_at is null
), pr as (
  select p.id, p.machine_key as mk, btrim(coalesce(p.inst_call,'')) as ic, p.inst_date, p.inst_call_status, p.installation_completed
    from public.products p
), hm as (select mk, count(*) n from hi where btrim(coalesce(serial,'')) <> '' group by mk),
   lm as (select mk, count(*) n from li group by mk)
select * from (
  select 1 as row, 'products (Product Database machines)' as what, count(*)::text as value from pr
  union all select 2, 'products with INST Call blank', count(*)::text from pr where ic = ''
  union all select 3, 'products with INST Call = a placeholder (not a call number)', count(*)::text from pr where ic <> '' and not public.is_call_number(ic)
  union all select 4, 'products with INST Call = a call number', count(*)::text from pr where public.is_call_number(ic)
  union all select 5, 'Call History rows', (select count(*) from public.call_history)::text
  union all select 6, 'Call History installation rows (call_type INST%)', (select count(*) from hi)::text
  union all select 7, '... of which distinct product+serial', (select count(*) from hm)::text
  union all select 8, 'blank/placeholder INST Call: exactly ONE history installation call by product+serial', count(*)::text
    from pr join hm using (mk) where (ic = '' or not public.is_call_number(ic)) and hm.n = 1
  union all select 9, 'blank/placeholder INST Call: SEVERAL history installation calls', count(*)::text
    from pr join hm using (mk) where (ic = '' or not public.is_call_number(ic)) and hm.n > 1
  union all select 10, 'blank/placeholder INST Call: one LIVE installation call', count(*)::text
    from pr join lm using (mk) where (ic = '' or not public.is_call_number(ic)) and lm.n = 1
  union all select 11, 'blank/placeholder INST Call: no installation call anywhere', count(*)::text
    from pr where (ic = '' or not public.is_call_number(ic)) and mk not in (select mk from hm) and mk not in (select mk from lm)
  union all select 12, 'INST Call already set AND a different single history call exists', count(*)::text
    from pr join hm using (mk) where public.is_call_number(ic) and hm.n = 1
     and not exists (select 1 from hi where hi.mk = pr.mk and (upper(hi.ucn) = upper(pr.ic) or upper(coalesce(hi.call_no,'')) = upper(pr.ic)))
  union all select 13, 'machine lines sharing one product+serial in products (duplicates)', count(*)::text
    from (select mk from pr group by mk having count(*) > 1) d
  union all select 14, 'history installation UCNs passing is_call_number()', (select count(*) from hi where public.is_call_number(hi.ucn))::text
  union all select 20 + row_number() over (), 'call_type in Call History: ' || coalesce(call_type,'(blank)'), n::text from ht
  union all select 40 + row_number() over (), 'sample history installation: ' || coalesce(ucn,'') || ' / ' || coalesce(call_no,'') || ' / ' || coalesce(item_name,'') || ' / ' || coalesce(serial,'') || ' / ' || coalesce(call_status,'') || ' / ' || coalesce(to_char(solved_at,'YYYY-MM-DD'),'') || ' / ' || coalesce(to_char(call_at,'YYYY-MM-DD'),''), ''
    from (select * from hi order by call_at desc nulls last limit 4) s
  union all select 50 + row_number() over (), 'sample products INST: ' || ic || ' / ' || coalesce(inst_date::text,'') || ' / ' || coalesce(inst_call_status,'') || ' / ' || coalesce(installation_completed,''), ''
    from (select * from pr where ic <> '' limit 4) s2
) z order by row;
