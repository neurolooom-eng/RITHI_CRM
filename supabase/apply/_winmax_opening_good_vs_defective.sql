-- READ-ONLY: what taking the Defective Balance out of the WinMax HS opening pool
-- would do to hand stock. One grid.
with w as (
  select o.engineer_key, o.part_code, o.qty,
         coalesce(nullif(replace(btrim(coalesce(o.data ->> 'Defective Balance', '')), ',', ''), '')::numeric, 0) as defective
    from public.handstock_opening o
   where o.source_key = 'winmax hs'
), d as (
  select w.*, b.on_hand, b.on_hand - w.defective as after
    from w join public.handstock_balance b on b.engineer_key = w.engineer_key and b.part_code = w.part_code
   where w.defective > 0
), r as (
  select public.handstock_key(m.engineer) as ek, public.part_code(m.part) as pc,
         sum(coalesce(m.defective_qty, 0)) as def_returned
    from public.material_returns m group by 1, 2
)
select 1 as k, 'lines with a defective opening' as what, count(*)::text as n from d
union all select 2, 'of them now in hand (> 0)', count(*) filter (where on_hand > 0)::text from d
union all select 3, 'of them would go below zero', count(*) filter (where on_hand >= 0 and after < 0)::text from d
union all select 4, 'of them already below zero', count(*) filter (where on_hand < 0)::text from d
union all select 5, 'units below zero after (sum of negatives)', coalesce(sum(after) filter (where after < 0), 0)::text from d
union all select 6, 'lines whose engineer has returned DEFECTIVE units of that part on an MRN', count(*) filter (where exists (select 1 from r where r.ek = d.engineer_key and r.pc = d.part_code and r.def_returned > 0))::text from d
union all select 7, 'defective units returned on MRNs for those lines', coalesce((select sum(r.def_returned) from r join d on r.ek = d.engineer_key and r.pc = d.part_code), 0)::text
union all select 8, 'example MP-010 / SUNIL: on hand now -> after', (select string_agg(on_hand || ' -> ' || after, '; ') from d where part_code = 'MP-010' and engineer_key like 'sunil kumar%')
order by 1;
