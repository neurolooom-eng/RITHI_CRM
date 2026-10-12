-- READ-ONLY: the WinMax HS opening pool -- how much of each row's quantity is the
-- Defective Balance the upload added to the Good Balance. One grid.
with w as (
  select o.id, o.engineer_key, o.part_code, o.qty,
         nullif(replace(btrim(coalesce(o.data ->> 'Defective Balance', '')), ',', ''), '')::numeric as defective,
         nullif(replace(btrim(coalesce(o.data ->> 'Good Balance', '')), ',', ''), '')::numeric as good_in_data,
         o.data ? 'Defective Balance' as has_def_key
    from public.handstock_opening o
   where o.source_key = 'winmax hs'
)
select 1 as k, 'WinMax HS rows' as what, count(*)::text as n from w
union all select 2, 'total quantity', sum(qty)::text from w
union all select 3, 'rows carrying Defective Balance in data', count(*) filter (where has_def_key)::text from w
union all select 4, 'rows with a defective quantity > 0', count(*) filter (where coalesce(defective, 0) > 0)::text from w
union all select 5, 'total defective quantity', coalesce(sum(defective), 0)::text from w
union all select 6, 'rows whose good balance is 0 (qty = defective)', count(*) filter (where coalesce(defective, 0) > 0 and qty = defective)::text from w
union all select 7, 'rows where qty <> good + defective (folded or odd)', count(*) filter (where qty <> coalesce(good_in_data, qty - coalesce(defective,0)) + coalesce(defective, 0))::text from w
union all select 8, 'rows with Good Balance key in data', count(*) filter (where good_in_data is not null)::text from w
union all select 9, 'example MP-010 / SUNIL (qty, defective)', (select string_agg(qty || ' / ' || coalesce(defective::text, '-'), '; ') from w where part_code = 'MP-010' and engineer_key like 'sunil kumar%')
order by 1;
