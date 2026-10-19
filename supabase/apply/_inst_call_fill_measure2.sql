-- Read-only, second pass: the serial as the file carried it, and INST Call by kind.
with hi as (
  select h.*,
         coalesce(nullif(btrim(h.serial), ''), nullif(btrim(h.extra->>'Product Serial Number'), ''), nullif(btrim(h.extra->>'Item Serial Number'), '')) as ser,
         coalesce(nullif(btrim(h.item_name), ''), nullif(btrim(h.extra->>'Product Name'), ''), nullif(btrim(h.extra->>'Product'), '')) as prod
    from public.call_history h
   where upper(coalesce(h.call_type, '')) like 'INST%'
), hk as (
  select hi.*, lower(coalesce(prod, '')) || '|' || lower(coalesce(ser, '')) as mk from hi
), hm as (select mk, count(*) n, count(distinct ucn) nu from hk where ser is not null and prod is not null group by mk),
pr as (
  select p.machine_key as mk, btrim(coalesce(p.inst_call, '')) as ic,
         case when btrim(coalesce(p.inst_call, '')) = '' then 'blank'
              when public.is_call_number(p.inst_call) then 'UCN (new style)'
              when btrim(p.inst_call) ~ '^[0-9]{2}[A-La-l][0-9]{4,6}$' then 'UCN (old style)'
              else 'other: ' || left(btrim(p.inst_call), 20) end as kind
    from public.products p
), lm as (select lower(btrim(coalesce(product_name,''))) || '|' || lower(btrim(coalesce(serial,''))) mk, count(*) n
            from public.installation_calls where cancelled_at is null group by 1)
select * from (
  select 1 as row, 'history installation rows' as what, count(*)::text as value from hk
  union all select 2, '... with a serial (serial or extra Product Serial Number)', count(*)::text from hk where ser is not null
  union all select 3, '... with a product name', count(*)::text from hk where prod is not null
  union all select 4, '... with both', count(*)::text from hk where ser is not null and prod is not null
  union all select 5, '... distinct product+serial', count(*)::text from hm
  union all select 6, '... call_no shaped WI-<product>-<serial>', count(*)::text from hk where call_no ilike 'WI-%'
  union all select 7, '... call status Solved%', count(*)::text from hk where call_status ilike 'solved%'
  union all select 8, '... call date range', min(call_at)::date || ' .. ' || max(call_at)::date from hk
  union all select 10 + row_number() over (order by count(*) desc), 'products INST Call kind: ' || kind, count(*)::text from pr group by kind
  union all select 30, 'INST Call NOT a UCN, and ONE history installation (product+serial)', count(*)::text
    from pr join hm using (mk) where pr.kind not like 'UCN%' and hm.nu = 1
  union all select 31, 'INST Call NOT a UCN, and SEVERAL history installations', count(*)::text
    from pr join hm using (mk) where pr.kind not like 'UCN%' and hm.nu > 1
  union all select 32, 'INST Call NOT a UCN, no history installation, ONE live installation call', count(*)::text
    from pr join lm using (mk) where pr.kind not like 'UCN%' and lm.n = 1 and mk not in (select mk from hm)
  union all select 33, 'INST Call NOT a UCN, matched by neither', count(*)::text
    from pr where pr.kind not like 'UCN%' and mk not in (select mk from hm) and mk not in (select mk from lm)
  union all select 34, 'INST Call IS a UCN and equals the single history call', count(*)::text
    from pr join hm using (mk) where pr.kind like 'UCN%' and hm.nu = 1 and exists (select 1 from hk where hk.mk = pr.mk and upper(hk.ucn) = upper(pr.ic))
  union all select 35, 'INST Call IS a UCN and DIFFERS from the single history call', count(*)::text
    from pr join hm using (mk) where pr.kind like 'UCN%' and hm.nu = 1 and not exists (select 1 from hk where hk.mk = pr.mk and upper(hk.ucn) = upper(pr.ic))
  union all select 36, 'history installations whose product+serial is NOT in the Product Database', count(*)::text
    from hm where mk not in (select mk from pr)
  union all select 40 + row_number() over (), 'history extra keys: ' || k, n::text
    from (select k, count(*) n from hk, jsonb_object_keys(coalesce(hk.extra, '{}'::jsonb)) k group by k order by n desc limit 12) e
  union all select 60 + row_number() over (), 'sample differs: products ' || d.ic || ' vs history ' || d.ucn || ' (' || d.mk || ')', ''
    from (select pr.ic, hk.ucn, hk.mk from pr join hm using (mk) join hk using (mk)
           where pr.kind like 'UCN%' and hm.nu = 1 and upper(hk.ucn) <> upper(pr.ic) limit 5) d
  union all select 70 + row_number() over (), 'sample no-UCN product with one history call: ' || d.ic || ' -> ' || d.ucn || ' / ' || coalesce(d.call_status,'') || ' / ' || coalesce(d.solved_at::date::text,''), ''
    from (select pr.ic, hk.ucn, hk.call_status, hk.solved_at from pr join hm using (mk) join hk using (mk)
           where pr.kind not like 'UCN%' and hm.nu = 1 limit 5) d
) z order by row;
